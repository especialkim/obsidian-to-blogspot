import { Plugin, TFile } from 'obsidian';
import { MyPluginSettings, DEFAULT_SETTINGS, SampleSettingTab } from './src/settings';
import { GoogleOauth } from './src/googleOauth';
import { MarkdownToHtml } from './src/markdownToHtml';
import { MakeLinkedDataSet } from './src/makeLinkedDataSet';
import { BloggerService } from './src/bloggerService';

// 이 클래스와 인터페이스의 이름을 바꾸는 것을 잊지 마세요!

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	bloggerService: BloggerService;
	googleOauth: GoogleOauth;
	markdownToHtml: MarkdownToHtml;
	makeLinkedDataSet: MakeLinkedDataSet;

	async onload() {
		await this.loadSettings();

		// 사용자가 플러그인의 다양한 측면을 구성할 수 있도록 설정 탭을 추가합니다.
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// GoogleOauth 인스턴스 생성
		this.googleOauth = new GoogleOauth(this.settings, this.app.vault, this.app);

		// MarkdownToHtml 인스턴스 생성
		this.markdownToHtml = new MarkdownToHtml(this.app, this.settings);

		// MakeLinkedDataSet 인스턴스 생성
		this.makeLinkedDataSet = new MakeLinkedDataSet(this.app, this.settings);

		// Get Google Auth Token ��령어 추가
		this.addCommand({
			id: 'get-google-auth-token',
			name: 'Get Google Auth Token',
			callback: () => this.googleOauth.getGoogleAuthToken(),
		});

		// Markdown to HTML 명령어 추가
		this.addCommand({
			id: 'markdown-to-html',
			name: 'Markdown to HTML',
			callback: () => this.markdownToHtml.convert(this.app.workspace.getActiveFile() as TFile),
		});

		this.addCommand({
			id: 'make-links-data-set',
			name: 'Make Links Data Set',
			callback: () => this.makeLinkedDataSet.makeConnectionDataSet(this.app.workspace.getActiveFile() as TFile),
		});

		this.addCommand({
			id: 'publish-to-blogspot',
			name: 'Publish to Blogspot',
			callback: () => {
				// Call the method in bloggerService to handle the publishing
				const bloggerService = new BloggerService(this.settings, this.app.vault, this.app);
				bloggerService.publish(this.app.workspace.getActiveFile() as TFile);
			},
		});

		this.addCommand({
			id: 'publish-to-blogspot-quick-update',
			name: 'Publish to Blogspot Quick Update',
			callback: () => {
				// Call the method in bloggerService to handle the publishing
				const bloggerService = new BloggerService(this.settings, this.app.vault, this.app);
				bloggerService.publishQuickUpdate(this.app.workspace.getActiveFile() as TFile);
			},
		});
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
