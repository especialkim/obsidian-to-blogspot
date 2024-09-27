import { App, TFile } from 'obsidian';
import { MyPluginSettings } from './settings';
import { ImgurService } from './imgurService';
import { MermaidService } from './mermaidService';
import { D2Service } from './d2Service';
import { MakeLinkedDataSet } from './makeLinkedDataSet';
import { LinkDataSet, PreprocessResult } from './types';

export class MarkdownPreprocessing {
    private imgurService: ImgurService; // Add this line
    private mermaidService: MermaidService;
    private d2Service: D2Service;
    private makeLinkedDataSet: MakeLinkedDataSet;

    constructor(
        private app: App, 
        private settings: MyPluginSettings
    ) {
        this.imgurService = new ImgurService(this.app.vault, this.settings); // settings 인수 전달
        this.mermaidService = new MermaidService(this);
        this.d2Service = new D2Service(this);
        this.makeLinkedDataSet = new MakeLinkedDataSet(this.app, this.settings);
    }

    async preprocess(content: string): Promise<{ content: string; linkDataSet: LinkDataSet }> {
        content = this.removeFrontmatter(content);
        content = this.trimContent(content);
        content = await this.processImageLinks(content);
        content = await this.processInternalLinks(content);
        content = await this.processCodeblocks(content);
        content = this.processObsidianSyntax(content);
        const linkDataSet = this.makeLinkedDataSet.makeConnectionDataSet();
        return { content, linkDataSet };
    }

    public removeFrontmatter(content: string): string {
        const frontmatterRegex = /^\s*---\s*\n(?:.*\n)*?---\s*\n/;
        return content.replace(frontmatterRegex, '');
    }

    private trimContent(content: string): string {
        const { startMarker, endMarker, includeStartMarker, includeEndMarker } = this.settings;

        let startIndex = 0;
        let endIndex = content.length;

        if (startMarker) {
            const markerIndex = content.indexOf(startMarker);
            if (markerIndex !== -1) {
                startIndex = includeStartMarker ? markerIndex : markerIndex + startMarker.length;
            }
        }

        if (endMarker) {
            const markerIndex = content.indexOf(endMarker, startIndex);
            if (markerIndex !== -1) {
                endIndex = includeEndMarker ? markerIndex + endMarker.length : markerIndex;
            }
        }

        return content.slice(startIndex, endIndex).trim();
    }

    public async processImageLinks(content: string): Promise<string> {
        const regex = /!\[\[(.*?\.(?:png|jpe?g|gif|svg)(?:\.[\w]+)*)(?:\|[^\]]+)?\]\]/gi;
        const promises: Promise<string>[] = [];

        content = content.replace(regex, (match, fileName) => {
            const promise = this.uploadAndReplaceImage(fileName);
            promises.push(promise);
            return match;
        });

        const replacements = await Promise.all(promises);
        let index = 0;
        return content.replace(regex, () => replacements[index++]);
    }

    public async uploadAndReplaceImage(fileName: string): Promise<string> {
        try {
            const filePath = this.findFilePath(fileName);
            if (filePath) {
                const file = this.app.vault.getAbstractFileByPath(filePath);
                if (file instanceof TFile) {
                    const url = await this.imgurService.uploadImage(file);
                    const fileNameWithoutExtension = fileName.replace(/\.[^/.]+$/, "");
                    return `![${fileNameWithoutExtension}](${url})`;
                }
            }
        } catch (error) {
            console.error(`Error uploading image ${fileName}:`, error);
        }
        return `![[${fileName}]]`;
    }

    private findFilePath(fileName: string): string | null {
        const files = this.app.vault.getFiles();
        const matchedFile = files.find(file => file.name === fileName);
        return matchedFile ? matchedFile.path : null;
    }

    public async processInternalLinks(content: string): Promise<string> {
        console.log("content", content)
        
        const regex = /\[\[([^\]]+)\]\]/g;
        const matches = Array.from(content.matchAll(regex));
        const replacements = await Promise.all(
            matches.map(async ([match, linkText]) => {
                if (linkText.match(/\.(png|jpe?g|gif|svg)$/i)) {
                    return { match, replacement: match };
                }

                let linkPath = this.findFilePath(linkText + '.svg');
                if (linkPath) {
                    const file = this.app.vault.getAbstractFileByPath(linkPath);
                    if (file instanceof TFile) {
                        const svgUrl = await this.imgurService.uploadImage(file);
                        return { match, replacement: `[${linkText}](${svgUrl})` };
                    }
                }

                linkPath = this.findFilePath(linkText + '.md');
                if (linkPath) {
                    const result = await this.processMarkdownLink(linkPath, linkText);
                    return { match, replacement: result };
                } else {
                    return { match, replacement: linkText };
                }
            })
        );

        replacements.forEach(({ match, replacement }) => {
            content = content.replace(match, replacement);
        });

        console.log("result-content", content)

        return content;
    }

    public async processMarkdownLink(filePath: string, linkText: string): Promise<string> {
        const file = this.app.vault.getAbstractFileByPath(filePath);

        if (file instanceof TFile) {
            const metadata = this.app.metadataCache.getFileCache(file);
            const blogArticleUrl = metadata?.frontmatter?.blogArticleUrl;
            if (blogArticleUrl) {
                return `[${linkText}](${blogArticleUrl})`;
            }
        }
        return `${linkText}`;
    }

    public async processCodeblocks(content: string): Promise<string> {
        const codeBlockRegex = /```\s*(\w*)\s*render\s*(.*?)\n([\s\S]*?)```/g;
        const matches = Array.from(content.matchAll(codeBlockRegex));
        
        for (const [match, language, alt, code] of matches) {
            const trimmedAlt = alt.trim();
            const rendered = await this.renderCodeBlock(language, code.trim(), trimmedAlt);
            content = content.replace(match, rendered);
        }
        
        return content;
    }

    private async renderCodeBlock(language: string, code: string, alt: string): Promise<string> {
        if (language.toLowerCase() === 'mermaid') {
            return await this.mermaidService.renderToSvg(code, alt);
        } else if (language.toLowerCase() === 'd2') {
            return await this.d2Service.renderToImageURL(code, alt);
        }
        return `\`\`\`${language}\n${code}\n\`\`\``;
    }

    public processObsidianSyntax(markdown: string): string {
        // Obsidian 특유의 문법 처리 (예: 내부 링크)
        return markdown.replace(/\[\[(.*?)\]\]/g, (match, p1) => {
            const parts = p1.split('|');
            const text = parts.length > 1 ? parts[1] : parts[0];
            return `[${text}](${parts[0]})`;
        });
    }

    public getVaultAdapter() {
        return this.app.vault.adapter;
    }

    public async removeFile(filePath: string): Promise<void> {
        await this.app.vault.adapter.remove(filePath);
    }
}
