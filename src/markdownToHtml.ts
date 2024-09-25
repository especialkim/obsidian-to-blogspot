import { marked } from 'marked';
import { App, Notice, TFile } from 'obsidian';
import { MarkdownPreprocessing } from './markdownPreprocessing';
import { MyPluginSettings } from './settings';
import { CalloutToHtml } from './calloutToHtml';
import { MakeLinkedDataSet } from './makeLinkedDataSet';
import { HtmlBundle } from './types';
import { normalizePath } from 'obsidian';

export class MarkdownToHtml {
	private app: App;
	private settings: MyPluginSettings;
    private markdownPreprocessing: MarkdownPreprocessing;
	private includeCssInPublish: boolean;

	constructor(app: App, settings: MyPluginSettings) {
		this.app = app;
		this.settings = settings;
		this.markdownPreprocessing = new MarkdownPreprocessing(app, settings);
		this.includeCssInPublish = this.settings.includeCssInPublish;
	}

	async convert() {
		const bundle = await this.markdownToHtmlBundle();
		let content = bundle.content;
		const hiddenLinks = bundle.hiddenLinks;

		content = this.convertLatexToHtml(content);

		if(this.settings.makeLinksDataSet){
			content += hiddenLinks;
		}
		
		const html = await this.makeHtmlDocument(content);
		const fileName = await this.createHtmlFile(html);
		await this.openHtmlFile(fileName);
	}

	async markdownToHtmlBundle(): Promise<HtmlBundle> {
		const activeFile = this.app.workspace.getActiveFile();

        if (!activeFile) {
            new Notice('No active file found.');
			return { title: '', content: '', labels: [], tags: [], hiddenLinks: ''}; 
		}

		const fileContent = await this.app.vault.read(activeFile);
		let { content, linkDataSet } = await this.markdownPreprocessing.preprocess(fileContent);

		content = content.replace(/==([^=]+)==/g, '<mark>$1</mark>');
		content = this.convertLatexToHtml(content);

		content = CalloutToHtml.process(content);
		content = await this.convertToHtml(content);
		content = this.restructureNestedLists(content);
		content = this.convertYoutubeLinksToIframes(content);
		content = this.removeParaWrappingFromImages(content);

		if (this.settings.useHtmlWrapClass) {
			const className = this.settings.htmlWrapClassName;
			content = `<div class="${className}">${content}</div>`;
		}

		const title = activeFile.name;
		const labels = linkDataSet.labels;
		const tags = linkDataSet.tags;
		const makeLinkedDataSet = new MakeLinkedDataSet(this.app, this.settings);
		const hiddenLinks = makeLinkedDataSet.linkedDataSetToHiddenLinksHtml(linkDataSet);

		if (this.settings.makeLinksDataSet){
			content = content + hiddenLinks;
		}
		return {title, content, labels, tags, hiddenLinks};
	}

	private async convertToHtml(markdown: string): Promise<string> {
        try {
            marked.setOptions({
                gfm: true,          // GitHub Flavored Markdown 활성화
                breaks: true      // 단일 줄바꿈을 <br>로 변환
            });

			console.log(markdown)
			console.log(marked.parse(markdown))
            return marked.parse(markdown);


        } catch (err) {
            throw new Error(`Markdown parsing failed: ${err}`);
        }
    }

	private restructureNestedLists(html: string): string {
        // console.log('Before restructuring:', html);

        // 1. <li>{텍스트}<ul> 또는 <li>{텍스트}<ol>를 <li>{텍스트}</li><ul> 또는 <li>{텍스트}</li><ol>로 변경 (이미 </li>가 있는 경우 제외)
        html = html.replace(/(<li[^>]*>)((?:(?!<\/li>).)*?)(<[ou]l>)/g, '$1$2</li>\n$3');

        // 2. </ul> 또는 </ol> {공백 또는 줄바꿈~~} </li> 를 </ul> 또는 </ol>로 대치
        html = html.replace(/<\/([ou]l)>\s*<\/li>/g, '</$1>');

        // console.log('After restructuring:', html);

        return html;
    }

    private convertYoutubeLinksToIframes(html: string): string {
        const youtubeRegex = /<img\s+src="(https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)(\S*))"\s+alt="(.*)"\s*\/?>/g;
        return html.replace(youtubeRegex, (match, url, _, __, videoId, params, alt) => {
            const embedUrl = `https://www.youtube.com/embed/${videoId}${params}`;
            return `<div class="youtube-embed-wrapper"><iframe class="youtube-embed" src="${embedUrl}" title="${alt}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
        });
    }

	private removeParaWrappingFromImages(content: string): string {
		return content.replace(/<p>\s*(<img[^>]+>)\s*<\/p>/g, '$1');
	}

	private async makeHtmlDocument(htmlBody: string): Promise<string> {
		return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>Document</title>
			<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.7/dist/katex.min.css">
			<style>
				${await this.getCssCode()}
			</style>
		</head>
		<body>
			${htmlBody}
		</body>
		</html>
		`
	}

	private async getCssCode(): Promise<string> {
		if(!this.includeCssInPublish){
			return ''
		}

		const cssFile = this.app.vault.getAbstractFileByPath(this.settings.cssFilePath) as TFile;
		const cssCode = await this.app.vault.read(cssFile);
		return cssCode;
	}

	private async createHtmlFile(html: string): Promise<string> {
		const fileName = 'output.html';
		const filePath = normalizePath(fileName);
		
		try {
			// Create or overwrite the HTML file in the vault
			await this.app.vault.adapter.write(filePath, html);
		} catch (error) {
			console.error('Error writing file:', error);
		}

		return fileName;
	}

	private async openHtmlFile(fileName: string): Promise<void> {
		// Open the HTML file in the default browser
		const file = this.app.vault.getAbstractFileByPath(fileName);
		if (file) {
			this.app.workspace.openLinkText(fileName, '', false, { active: true });
		} else {
			console.error('File not found:', fileName);
		}
	}
	
	private convertLatexToHtml(markdown: string): string {
		// First, handle inline LaTeX ($...$), but not \$...\$ and not inside $$...$$
		let result = markdown.replace(/(?<!\$)(?<!\\)\$(?!\$)((?:[^\$\\]|\\.)*?[^\\])\$(?!\$)/g, (match, latex) => {
			return `<span class="math math-inline">$${latex}$</span>`;
		});

		// Then, handle block LaTeX ($$...$$)
		result = result.replace(/(\$\$)([\s\S]*?)(\$\$)/g, (match, start, latex, end) => {
			return `<div class="math math-display">${start}${latex}${end}</div>`;
		});

		return result;
	}
}
