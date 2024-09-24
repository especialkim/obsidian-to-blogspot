import { marked } from 'marked';
import { App, Notice } from 'obsidian';
import { MarkdownPreprocessing } from './markdownPreprocessing';
import { MyPluginSettings } from './settings';
import { CalloutToHtml } from './calloutToHtml';
import { MakeLinkedDataSet } from './makeLinkedDataSet';

export class MarkdownToHtml {
	private app: App;
	private settings: MyPluginSettings;
    private markdownPreprocessing: MarkdownPreprocessing;

	constructor(app: App, settings: MyPluginSettings) {
		this.app = app;
		this.settings = settings;
		this.markdownPreprocessing = new MarkdownPreprocessing(app, settings);
	}

	async convert() {
		const activeFile = this.app.workspace.getActiveFile();

        if (!activeFile) {
            new Notice('No active file found.');
			return;
		}

		const fileContent = await this.app.vault.read(activeFile);
		let { content, linkDataSet } = await this.markdownPreprocessing.preprocess(fileContent);

		content = CalloutToHtml.process(content);
		content = await this.convertToHtml(content);
		content = this.restructureNestedLists(content);
		content = this.convertYoutubeLinksToIframes(content);

		if (this.settings.useHtmlWrapClass) {
			const className = this.settings.htmlWrapClassName;
			content = `<div class="${className}">${content}</div>`;
		}

		if (!this.settings.makeLinksDataSet){
			console.log(content)
			return content;
		}

		const title = activeFile.name;
		const labels = linkDataSet.labels;
		const tags = linkDataSet.tags;
		const makeLinkedDataSet = new MakeLinkedDataSet(this.app, this.settings);
		const hiddenLinks = makeLinkedDataSet.linkedDataSetToHiddenLinksHtml(linkDataSet);

		console.log({title, content, labels, tags, hiddenLinks});
		return {title, content, labels, tags, hiddenLinks};

	}

	private async convertToHtml(markdown: string): Promise<string> {
        try {
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
}
