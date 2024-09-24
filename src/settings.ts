import { App, PluginSettingTab, Setting } from 'obsidian';
import MyPlugin from '../main';

export interface BlogInfo {
    id: string; // 새로운 필드 추가
    url: string;
    alias: string;
}

export interface MyPluginSettings {
	mySetting: string;
	credentialsFilePath: string; // 추가된 설정 필드
    tokenStoragePath: string;
    bloggerUserId: string;
    blogInfos: BlogInfo[]; // 새로운 필드
    imgurClientId: string; // 추가된 필드
    includeStartMarker: boolean; // 추가된 필드
    startMarker: string; // 추가된 필드
    includeEndMarker: boolean; // 추가된 필드
    endMarker: string; // 추가된 필드
    useHtmlWrapClass: boolean; // 추가된 필드
    htmlWrapClassName: string; // 추가된 필드
    dateFormat: string; // 추가된 필드
    dateLanguage: 'ko' | 'en'; // 추가된 필드
    openBrowserAfterPublish: boolean; // 추가된 필드
    makeLinksDataSet: boolean; // 추가된 필드
    labelPrefixes: string; // 추가된 필드
    cssFilePath: string; // 추가된 필드
    useOutlinksForLabels: boolean; // 추가된 필드
    excludeLinkExtensions: string; // 추가된 필드
    includeLinkPrefixes: string; // 추가된 필드
    excludeTagsContaining: string; // 추가된 필드
    includeCssInPublish: boolean; // 추가된 필드
}

export const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default',
	credentialsFilePath: '', // 기본값 설정
    tokenStoragePath: '',
    bloggerUserId: '',
    blogInfos: [{ id: '', url: '', alias: '' }], // 기본값으로 빈 세트 하나 제공
    imgurClientId: '', // 기본값 설정
    includeStartMarker: false, // 기본값 설정
    startMarker: '', // 기본값 설정
    includeEndMarker: false, // 기본값 설정
    endMarker: '', // 기본값 설정
    useHtmlWrapClass: false, // 기본값 설정
    htmlWrapClassName: '', // 기본값 설정
    dateFormat: '', // 기본값 설정
    dateLanguage: 'en', // 기본값 설정
    openBrowserAfterPublish: false, // 기본값 설정
    makeLinksDataSet: false, // 기본값 설정
    labelPrefixes: '', // 기본값 설정
    cssFilePath: '', // 기본값 설정
    useOutlinksForLabels: false, // 기본값 설정
    excludeTagsContaining: '', // 기본값 설정
    excludeLinkExtensions: '', // 기본값 설정
    includeLinkPrefixes: '', // 기본값 설정
    includeCssInPublish: false, // 기본값 설정
}

export class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'Oauth2 Settings', cls: 'obsidian-to-blogger'});

		new Setting(containerEl)
			.setName('OAuth Client Secret JSON File')
			.setDesc('Select the OAuth client secret JSON file from your vault')
			.addDropdown(dropdown => {
				// JSON 파일만 필터링
				const jsonFiles = this.app.vault.getFiles().filter(file => file.extension === 'json');
				
				// 드롭다운 옵션 설정
				jsonFiles.forEach(file => {
					dropdown.addOption(file.path, file.path);
				});

				// 현재 설정값 선택
				dropdown.setValue(this.plugin.settings.credentialsFilePath);

				// 변경 이벤트 처리
				dropdown.onChange(async (value) => {
					this.plugin.settings.credentialsFilePath = value;
					await this.plugin.saveSettings();
				});
			});

        new Setting(containerEl)
            .setName('(Opt)Access Token Path')
            .setDesc('Select the JSON file where the access token will be stored')
            .addDropdown(dropdown => {
                // JSON 파일만 필터링
                const jsonFiles = this.app.vault.getFiles().filter(file => file.extension === 'json');
                
                // 드롭다운 옵션 설정
                jsonFiles.forEach(file => {
                    dropdown.addOption(file.path, file.path);
                });

                // 현재 설정값 선택
                dropdown.setValue(this.plugin.settings.tokenStoragePath);

                // 변경 이벤트 처리
                dropdown.onChange(async (value) => {
                    this.plugin.settings.tokenStoragePath = value;
                    await this.plugin.saveSettings();
                });
            });

        containerEl.createEl('h2', {text: 'Blog Information', cls: 'obsidian-to-blogger'});

        new Setting(containerEl)
        .setName('Blogger User ID')
        .setDesc('Enter your Blogger user ID')
        .addText(text => text
            .setPlaceholder('Enter your Blogger user ID')
            .setValue(this.plugin.settings.bloggerUserId)
            .onChange(async (value) => {
                this.plugin.settings.bloggerUserId = value;
                await this.plugin.saveSettings();
            }));

        // 블로그 정보 설정 추가
        const blogInfoContainer = containerEl.createDiv();
        this.plugin.settings.blogInfos.forEach((blogInfo, index) => {
            this.createBlogInfoSetting(blogInfoContainer, index);
        });

        // 새 블로그 정보 추가 버튼
        new Setting(containerEl)
            .addButton(button => button
                .setButtonText('+')
                .onClick(async () => {
                    this.plugin.settings.blogInfos.push({ id: '', url: '', alias: '' });
                    await this.plugin.saveSettings();
                    this.display(); // 설정 화면 새로고침
                })
            );

        containerEl.createEl('h2', {text: 'Markdown Preprocessing', cls: 'obsidian-to-blogger'});

        new Setting(containerEl)
        .setName('Imgur Client ID')
        .setDesc('Enter your Imgur Client ID')
        .addText(text => text
            .setPlaceholder('Enter your client id')
            .setValue(this.plugin.settings.imgurClientId)
            .onChange(async (value) => {
                this.plugin.settings.imgurClientId = value;
                await this.plugin.saveSettings();
            }));

        new Setting(containerEl)
        .setName('Include Start Marker')
        .setDesc('Include the line with the start marker in the output')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.includeStartMarker)
            .onChange(async (value) => {
                this.plugin.settings.includeStartMarker = value;
                await this.plugin.saveSettings();
            }));

        new Setting(containerEl)
            .setName('Start Marker')
            .setDesc('Text to mark the start of the content to be published')
            .addText(text => text
                .setPlaceholder('Enter start marker')
                .setValue(this.plugin.settings.startMarker)
                .onChange(async (value) => {
                    this.plugin.settings.startMarker = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Include End Marker')
            .setDesc('Include the line with the end marker in the output')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeEndMarker)
                .onChange(async (value) => {
                    this.plugin.settings.includeEndMarker = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('End Marker')
            .setDesc('Text to mark the end of the content to be published')
            .addText(text => text
                .setPlaceholder('Enter end marker')
                .setValue(this.plugin.settings.endMarker)
                .onChange(async (value) => {
                    this.plugin.settings.endMarker = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h2', {text: 'HTML Formatting', cls: 'obsidian-to-blogger'});

        new Setting(containerEl)
            .setName('Use HTML Wrap Class')
            .setDesc('Wrap the converted HTML in a div with a custom class')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.useHtmlWrapClass)
                .onChange(async (value) => {
                    this.plugin.settings.useHtmlWrapClass = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('HTML Wrap Class Name')
            .setDesc('Class name for the wrapping div (if enabled)')
            .addText(text => text
                .setPlaceholder('Enter class name')
                .setValue(this.plugin.settings.htmlWrapClassName)
                .onChange(async (value) => {
                    this.plugin.settings.htmlWrapClassName = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Include CSS in Publish')
            .setDesc('Include CSS this setting when publishing to Blogger. If OFF, it will only apply during markdown to HTML conversion.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.includeCssInPublish)
                .onChange(async (value) => {
                    this.plugin.settings.includeCssInPublish = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
        .setName('CSS/MD File Path')
        .setDesc('Select the CSS or MD file from your vault')
        .addText(text => text
            .setPlaceholder('Enter class name')
            .setValue(this.plugin.settings.cssFilePath)
            .onChange(async (value) => {
                this.plugin.settings.cssFilePath = value;
                await this.plugin.saveSettings();
            }));

        containerEl.createEl('h2', {text: 'Frontmatter', cls: 'obsidian-to-blogger'});

        new Setting(containerEl)
            .setName('Date Format')
            .setDesc('Specify the format for dates (e.g., "[[YYYY-MM-DD(ddd)|YYYY-MM-DD(ddd) HH:mm]]")')
            .addText(text => text
                .setPlaceholder('Enter date format')
                .setValue(this.plugin.settings.dateFormat)
                .onChange(async (value) => {
                    this.plugin.settings.dateFormat = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Date Language')
            .setDesc('Choose the language for date formatting')
            .addDropdown(dropdown => dropdown
                .addOption('ko', '한국어')
                .addOption('en', 'English')
                .setValue(this.plugin.settings.dateLanguage)
                .onChange(async (value: 'ko' | 'en') => {
                    this.plugin.settings.dateLanguage = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h2', {text: 'Links Data Set', cls: 'obsidian-to-blogger'});

        new Setting(containerEl)
        .setName('Make Links Data Set')
        .setDesc('Choose whether to create a dataset for organizing backlinks, outlinks, references, and labels in the post')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.makeLinksDataSet)
            .onChange(async (value) => {
                this.plugin.settings.makeLinksDataSet = value;
                await this.plugin.saveSettings();
            }));

        new Setting(containerEl)
        .setName('Label Source Selection')
        .setDesc('Choose whether to use tags or outlinks for labels in the post (OFF = tags, ON = outlinks filtered by Label Link Prefix)')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.useOutlinksForLabels)
            .onChange(async (value) => {
                this.plugin.settings.useOutlinksForLabels = value;
                await this.plugin.saveSettings();
            }));

        new Setting(containerEl)
        .setName('Exclude Tags Containing Text')
        .setDesc('Enter text to exclude tags that contain it, separated by commas')
        .addText(text => text
            .setPlaceholder('e.g., exclude1,exclude2')
            .setValue(this.plugin.settings.excludeTagsContaining)
            .onChange(async (value) => {
                this.plugin.settings.excludeTagsContaining = value;
                await this.plugin.saveSettings();
            }));

        new Setting(containerEl)
            .setName('Label Link Prefix')
            .setDesc('Prefix to use for label links in the post, separated by commas')
            .addText(text => text
                .setPlaceholder(')')
                .setValue(this.plugin.settings.labelPrefixes)
                .onChange(async (value) => {
                    this.plugin.settings.labelPrefixes = value;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(containerEl)
        .setName('Excluded Link Extensions')
        .setDesc('Enter the extensions to exclude from links, separated by commas')
        .addText(text => text
            .setPlaceholder('e.g., jpg,png,txt')
            .setValue(this.plugin.settings.excludeLinkExtensions)
            .onChange(async (value) => {
                this.plugin.settings.excludeLinkExtensions = value;
                await this.plugin.saveSettings();
            }));

        new Setting(containerEl)
        .setName('Include Link Prefixes')
        .setDesc('Enter the prefixes to include for links, separated by commas')
        .addText(text => text
            .setPlaceholder('e.g., prefix1,prefix2')
            .setValue(this.plugin.settings.includeLinkPrefixes)
            .onChange(async (value) => {
                this.plugin.settings.includeLinkPrefixes = value;
                await this.plugin.saveSettings();
            }));
        

        
        containerEl.createEl('h2', {text: 'Etc', cls: 'obsidian-to-blogger'});

        new Setting(containerEl)
        .setName('Open Browser After Publish')
        .setDesc('Automatically open the published post in browser after successful upload')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.openBrowserAfterPublish)
            .onChange(async (value) => {
                this.plugin.settings.openBrowserAfterPublish = value;
                await this.plugin.saveSettings();
            }));

	}

	createBlogInfoSetting(container: HTMLElement, index: number): void {
		const setting = new Setting(container)
			.setName(`Blog Info ${index + 1}`)
			.addText(text => text
				.setPlaceholder('Blog ID')
				.setValue(this.plugin.settings.blogInfos[index].id)
				.onChange(async (value) => {
					this.plugin.settings.blogInfos[index].id = value;
					await this.plugin.saveSettings();
				}))
			.addText(text => text
				.setPlaceholder('Blog URL')
				.setValue(this.plugin.settings.blogInfos[index].url)
				.onChange(async (value) => {
					this.plugin.settings.blogInfos[index].url = value;
					await this.plugin.saveSettings();
				}))
			.addText(text => text
				.setPlaceholder('Blog Alias')
				.setValue(this.plugin.settings.blogInfos[index].alias)
				.onChange(async (value) => {
					this.plugin.settings.blogInfos[index].alias = value;
					await this.plugin.saveSettings();
				}))
			.addButton(button => button
				.setButtonText('X')
				.onClick(async () => {
					this.plugin.settings.blogInfos.splice(index, 1);
					await this.plugin.saveSettings();
					this.display(); // 설정 화면 새로고침
				}));
	}
}
