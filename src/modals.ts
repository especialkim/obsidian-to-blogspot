import { Modal, App, Setting } from 'obsidian';
import { MyPluginSettings } from './settings';

export interface PostSettings {
    blogAlias: string;
    blogType: 'post' | 'page';
    blogTitle: string;
    blogLabels: string;
    blogUrl: string;
    blogId: string;
    blogArticleId: string;
    blogArticleUrl: string;
    blogIsDraft: 'true' | 'false';
    blogPublished: string;
    blogUpdated: string;
}

export class PostSettingsModal extends Modal {
    private settings: MyPluginSettings;
    private modalData: PostSettings;
    private onSubmit: (resultData: PostSettings | null) => void;
    private submitted: boolean = false;

    constructor(app: App, settings: MyPluginSettings, modalData: PostSettings, onSubmit: (resultData: PostSettings | null) => void) {
        super(app);
        this.modalData = modalData;
        this.onSubmit = onSubmit;
        this.settings = settings;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'Post Settings' });

        new Setting(contentEl)
            .setName('Which Blog?')
            .setDesc('Select the blog to post to')
            .addDropdown(dropdown => {
                // blogInfos에서 옵션 추가
                this.settings.blogInfos.forEach(blogInfo => {
                    dropdown.addOption(blogInfo.url, blogInfo.alias);
                });

                // 기본값 설정
                const defaultBlog = this.modalData.blogAlias 
                    ? this.settings.blogInfos.find(blogInfo => blogInfo.alias === this.modalData.blogAlias)
                    : this.settings.blogInfos[0];

                if (defaultBlog) {
                    dropdown.setValue(defaultBlog.url);
                    this.modalData.blogUrl = defaultBlog.url;
                    this.modalData.blogAlias = defaultBlog.alias;
                    this.modalData.blogId = defaultBlog.id;
                }

                dropdown.onChange(value => {
                    const selectedBlog = this.settings.blogInfos.find(blogInfo => blogInfo.url === value);
                    if (selectedBlog) {
                        this.modalData.blogUrl = selectedBlog.url;
                        this.modalData.blogAlias = selectedBlog.alias;
                        this.modalData.blogId = selectedBlog.id;
                    }
                });
            });

        new Setting(contentEl)
            .setName('Post or Page?')
            .setDesc('Select whether this is a post or a page')
            .addDropdown(dropdown => {
                dropdown.addOption('post', 'Post');
                dropdown.addOption('page', 'Page');
                dropdown.setValue(this.modalData.blogType);
                dropdown.onChange(value => {
                    this.modalData.blogType = value as 'post' | 'page';
                });
            });

        new Setting(contentEl)
            .setName('Title')
            .setDesc('Enter the title of the post')
            .addText(text => {
                text.setValue(this.modalData.blogTitle);
                text.onChange(value => {
                    this.modalData.blogTitle = value;
                });
            });

        new Setting(contentEl)
            .setName('Labels')
            .setDesc('Enter labels for the post')
            .addText(text => {
                text.setValue(this.modalData.blogLabels);
                text.onChange(value => {
                    this.modalData.blogLabels = value;
                });
            });

        new Setting(contentEl)
            .setName('Draft Status')
            .setDesc('Should this be a draft? Default is false.')
            .addDropdown(dropdown => {
                dropdown.addOption('false', 'No');
                dropdown.addOption('true', 'Yes');
                dropdown.setValue(this.modalData.blogIsDraft);
                dropdown.onChange(value => {
                    this.modalData.blogIsDraft = value as 'true' | 'false';
                });
            });

        contentEl.createEl('button', { text: 'Submit' }).addEventListener('click', () => {
            this.submitted = true;
            this.onSubmit(this.modalData);
            this.close();
        });
    }

    onClose() {
        if (!this.submitted) {
            this.onSubmit(null);
        }
        const { contentEl } = this;
        contentEl.empty();
    }
}

/* 

Which Blog?
Post or Page?
title
labels
Visibility

*/