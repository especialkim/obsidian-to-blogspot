import { App, Notice } from 'obsidian';
import { MarkdownPreprocessing } from './markdownPreprocessing';
import { MyPluginSettings } from './settings';

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
        if (activeFile) {
            const fileContent = await this.app.vault.read(activeFile);
            const content = await this.markdownPreprocessing.preprocess(fileContent);
            // content 와 metadata 를 반환하도록 해야 함
            console.log(content);
        } else {
            new Notice('No active file found.');
        }


	}
}
