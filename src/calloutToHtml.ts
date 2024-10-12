import { MarkdownPreprocessing } from './markdownPreprocessing';
import { MarkdownToHtml } from './markdownToHtml';

export class CalloutToHtml {
    // 콜아웃 시작을 감지하는 정규표현식
    private static CALLOUT_RE = /^>\s?\[!(\w+)\]\s*(.*?)$/;
    // 목록 항목을 감지하는 정규표현식
    private static LIST_RE = /^(\s*)-\s*(.*)$/;

    static async advancedProcess(
        markdown: string,
        markdownPreprocessing: MarkdownPreprocessing,
        markdownToHtml: MarkdownToHtml
    ): Promise<string> {
        const calloutPattern = /> \[!(.*?)\]( .*?)?\n([\s\S]*?)(?=\n\n|$)/g;

        const processedContent = await this.replaceAsync(markdown, calloutPattern, async (match, calloutType, calloutName, calloutContent) => {
            const type = calloutType.trim();
            const name = calloutName ? calloutName.trim() : ''; // 타이틀이 없는 경우 빈 문자열로 처리
            let content = calloutContent
                .split('\n')
                .map((line: string) => line.replace(/^>\s?/, ''))
                .join('\n')
                .replace(/\n{2,}/g, '\n\n'); // Ensure that multiple newlines are preserved
            
            // Apply markdown preprocessing
            content = await markdownPreprocessing.processImageLinks(content);
            content = await markdownPreprocessing.processInternalLinks(content);
            content = await markdownPreprocessing.processCodeblocks(content);
            content = markdownPreprocessing.processObsidianSyntax(content);
            
            // Convert to HTML and apply post-processing
            content = await markdownToHtml.convertToHtml(content);
            content = markdownToHtml.restructureNestedLists(content);
            content = markdownToHtml.convertYoutubeLinksToIframes(content);
            content = content.replace(/<p>(<img[^>]+>)<\/p>/g, '<div>$1</div>');

            // Generate HTML structure
            const htmlCallout = `<div class="callout callout-${type.toLowerCase()}">`;
            const htmlCalloutTitle = `<div class="callout-title">${name || type}</div>`;
            const htmlCalloutContent = `<div class="callout-content">${content}</div>`;

            return `${htmlCallout}\n${htmlCalloutTitle}\n${htmlCalloutContent}\n</div>`;
        });

        return processedContent;
    }

    private static async replaceAsync(str: string, regex: RegExp, asyncFn: (...args: string[]) => Promise<string>): Promise<string> {
        const promises: Promise<string>[] = [];
        str.replace(regex, (match, ...args) => {
            const promise = asyncFn(match, ...args);
            promises.push(promise);
            return match;
        });
        const data = await Promise.all(promises);
        return str.replace(regex, () => data.shift() || '');
    }

    static process(content: string): string {
        const lines = content.split('\n');
        const newLines: string[] = [];
        let inCallout = false;
        let calloutType = '';
        let calloutTitle = '';
        let calloutContent: string[] = [];

        // 각 줄을 순회하며 콜아웃을 처리
        for (const line of lines) {
            const match = line.match(this.CALLOUT_RE);
            if (match) {
                // 새로운 콜아웃 시작
                if (inCallout) {
                    // 이전 콜아웃이 있다면 처리
                    newLines.push(...this.formatCallout(calloutType, calloutTitle, calloutContent));
                    calloutContent = [];
                }
                inCallout = true;
                calloutType = match[1];
                calloutTitle = match[2].trim();
            } else if (inCallout && line.startsWith('>')) {
                // 콜아웃 내용 처리
                calloutContent.push(line.slice(1)); // '>' 문자 제거
            } else {
                // 콜아웃 종료 또는 일반 텍스트
                if (inCallout) {
                    newLines.push(...this.formatCallout(calloutType, calloutTitle, calloutContent));
                    inCallout = false;
                    calloutType = '';
                    calloutTitle = '';
                    calloutContent = [];
                }
                newLines.push(line);
            }
        }

        // 마지막 콜아웃 처리
        if (inCallout) {
            newLines.push(...this.formatCallout(calloutType, calloutTitle, calloutContent));
        }

        return newLines.join('\n');
    }

    private static formatCallout(calloutType: string, calloutTitle: string, content: string[]): string[] {
        const processedContent = this.processCalloutContent(content);

        const processInlineStyles = (text: string): string => {
            return text
                .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/==(.*?)==/g, '<mark>$1</mark>')
                .replace(/(?<!`)`(?!`)(\S.*?\S|\S)`(?!`)/g, '<code>$1</code>')
                .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
        };

        const styledTitle = processInlineStyles(calloutTitle || calloutType);
        const styledContent = processInlineStyles(processedContent);

        return [
            `<div class="callout callout-${calloutType.toLowerCase()}">`,
            `<div class="callout-title">${styledTitle}</div>`,
            '<div class="callout-content">',
            styledContent,
            '</div>',
            '</div>',
            ''
        ];
    }

    private static processCalloutContent(content: string[]): string {
        let processedContent: string[] = [];
        let currentParagraph: string[] = [];
        let listStack: number[] = [];
        let minIndent = Infinity;

        // 최소 들여쓰기 찾기
        for (const line of content) {
            const match = line.match(/^(\s*)>?\s*-/);
            if (match) {
                minIndent = Math.min(minIndent, match[1].length);
            }
        }

        minIndent = minIndent === Infinity ? 0 : minIndent;

        for (const line of content) {
            const cleanedLine = line.replace(/^>\s*/, '');
            const strippedLine = cleanedLine.trimStart();

            if (!strippedLine) {
                if (currentParagraph.length > 0) {
                    processedContent.push(`<p>${currentParagraph.join('<br>')}</p>`);
                    currentParagraph = [];
                }
                continue;
            }

            if (strippedLine.startsWith('-')) {
                if (currentParagraph.length > 0) {
                    processedContent.push(`<p>${currentParagraph.join('<br>')}</p>`);
                    currentParagraph = [];
                }

                const indent = cleanedLine.length - strippedLine.length;
                const item = strippedLine.slice(1).trim();
                const indentLevel = Math.max(0, Math.floor((indent - minIndent))) + 1;

                // 목록 구조 조정
                while (listStack.length > indentLevel) {
                    listStack.pop();
                    processedContent.push('</ul>');
                }
                while (listStack.length < indentLevel) {
                    processedContent.push('<ul>');
                    listStack.push(listStack.length);
                }

                let processedItem = item;
                if (item.startsWith('[ ]') || item.startsWith('[x]')) {
                    processedItem = `☑️ ${item.slice(3)}`;
                }

                processedContent.push(`<li>${processedItem}</li>`);
            } else {
                // 목록이 끝났을 때 모든 열린 목록 태그 닫기
                while (listStack.length > 0) {
                    listStack.pop();
                    processedContent.push('</ul>');
                }
                currentParagraph.push(strippedLine);
            }
        }

        if (currentParagraph.length > 0) {
            processedContent.push(`<p>${currentParagraph.join('<br>')}</p>`);
        }

        // 남은 목록 태그 닫기
        while (listStack.length > 0) {
            listStack.pop();
            processedContent.push('</ul>');
        }

        return processedContent.join('\n');
    }

    private static applyInlineStyles(text: string): string {
        return text
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/==(.*?)==/g, '<mark>$1</mark>')
            .replace(/(?<!`)`(?!`)(\S.*?\S|\S)`(?!`)/g, '<code>$1</code>')
            .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');
    }
}