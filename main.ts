import { App, Editor, MarkdownView, Modal, Notice, Plugin } from 'obsidian';
import { MyPluginSettings, DEFAULT_SETTINGS, SampleSettingTab } from './src/settings';
import { GoogleOauth } from './src/googleOauth';
import { MarkdownToHtml } from './src/markdownToHtml';

// 이 클래스와 인터페이스의 이름을 바꾸는 것을 잊지 마세요!

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;
	googleOauth: GoogleOauth;
	markdownToHtml: MarkdownToHtml;

	async onload() {
		await this.loadSettings();

		// 사용자가 플러그인의 다양한 측면을 구성할 수 있도록 설정 탭을 추가합니다.
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// GoogleOauth 인스턴스 생성
		this.googleOauth = new GoogleOauth(this.settings, this.app.vault, this.app);

		// Get Google Auth Token 명령어 추가
		this.addCommand({
			id: 'get-google-auth-token',
			name: 'Get Google Auth Token',
			callback: () => this.googleOauth.getGoogleAuthToken(),
		});

		// MarkdownToHtml 인스턴스 생성
		this.markdownToHtml = new MarkdownToHtml(this.app, this.settings);

		// Markdown to HTML 명령어 추가
		this.addCommand({
			id: 'markdown-to-html',
			name: 'Markdown to HTML',
			callback: () => this.markdownToHtml.convert(),
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
