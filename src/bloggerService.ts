import { PostSettingsModal, PostSettings } from './modals';
import { GoogleOauth } from './googleOauth';
import { MarkdownToHtml } from './markdownToHtml';
import { Vault, App, Notice, TFile } from 'obsidian';
import { MyPluginSettings } from './settings';
import { BloggerFrontmatter } from './types';   
import { format } from 'date-fns';
import { ko, enUS } from 'date-fns/locale';
import { updateFrontmatter } from './frontmatterManager';

export class BloggerService {
    private settings: MyPluginSettings;
    private googleOauth: GoogleOauth;
    private markdownToHtml: MarkdownToHtml;
    private vault: Vault;
    private app: App;

    constructor(settings: MyPluginSettings, vault: Vault, app: App) {
        this.settings = settings;
        this.vault = vault;
        this.app = app;
        this.googleOauth = new GoogleOauth(settings, vault, app);
        this.markdownToHtml = new MarkdownToHtml(app, settings);
    }

    private async getAccessToken(): Promise<string> {
        const tokenInfo = await this.googleOauth.getGoogleAuthToken();
        
        if (!tokenInfo.access_token) {
            throw new Error('Failed to obtain access token');
        }
        
        return tokenInfo.access_token;
    }

    public async publish(): Promise<void> {

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No active file');
            return;
        }

        try {
            const accessToken = await this.getAccessToken();
            const htmlBundle = await this.markdownToHtml.markdownToHtmlBundle();

            const title = htmlBundle.title;
            let content = htmlBundle.content;
            const hiddenLinks = htmlBundle.hiddenLinks;

            let labels = htmlBundle.labels;
            const tags = htmlBundle.tags;

            if (!this.settings.useOutlinksForLabels) {
                labels = tags.map(tag => tag.replace("#", ''));
            }else{
                labels = labels.map(label => label.replace(this.settings.labelPrefixes + ' ', ''));
            }

            const frontMatter = await this.getFrontMatter(activeFile);

            // frontmatter를 확인하고 초기화
            let blogAlias = frontMatter?.blogAlias || '';
            let blogId = frontMatter?.blogId || '';
            let blogUrl = frontMatter?.blogUrl || '';
            let blogType = frontMatter?.blogType || 'post';
            let blogTitle = frontMatter?.blogTitle || title.replace(/\.[^/.]+$/, ""); // Remove file extension from title
            let blogArticleId = frontMatter?.blogArticleId || '';
            let blogArticleUrl = frontMatter?.blogArticleUrl || ''; // 이 줄을 추가합니다
            let blogLabels = frontMatter?.blogLabels || labels.join(', ');
            let blogIsDraft = frontMatter?.blogIsDraft || 'false';
            let blogPublished = frontMatter?.blogPublished || '';
            let blogUpdated = frontMatter?.blogUpdated || '';

            const initialModalData: PostSettings = {
                blogAlias: blogAlias,
                blogId: blogId,
                blogUrl: blogUrl,
                blogType: blogType as 'post' | 'page',
                blogTitle: blogTitle,
                blogArticleId: blogArticleId,
                blogArticleUrl: blogArticleUrl,
                blogLabels: blogLabels,
                blogIsDraft: blogIsDraft as 'true' | 'false',
                blogPublished: blogPublished,
                blogUpdated: blogUpdated,
            };

            const updatedSettings = await this.openPostSettingsModal(initialModalData);

            if (updatedSettings === null) {
                // User closed the modal without submitting
                new Notice('Publishing cancelled');
                return;
            }

            let bloggerResponse;

            if (frontMatter === null || !updatedSettings.blogArticleId) {
                // 프론트매터가 없거나 BlogArticleId가 없는 경우 (새 포스트/페이지 생성)
                if (updatedSettings.blogType === 'post') {
                    bloggerResponse = await this.createBloggerPost(
                        updatedSettings.blogId,
                        updatedSettings.blogTitle,
                        content,
                        updatedSettings.blogLabels ? updatedSettings.blogLabels.split(',').map(label => label.trim()).filter(label => label !== '') : [],
                        updatedSettings.blogIsDraft,
                        accessToken
                    );
                } else if (updatedSettings.blogType === 'page') {
                    bloggerResponse = await this.createBloggerPage(
                        updatedSettings.blogId,
                        updatedSettings.blogTitle,
                        content,
                        accessToken
                    );
                }
            } else {
                // 프론트매터에 BlogArticleId가 있는 경우 (기존 포스트/페이지 업데이트)
                if (updatedSettings.blogType === 'post') {
                    bloggerResponse = await this.updateBloggerPost(
                        updatedSettings.blogId,
                        updatedSettings.blogArticleId,
                        updatedSettings.blogTitle,
                        content,
                        updatedSettings.blogLabels.split(',').map(label => label.trim()),
                        updatedSettings.blogIsDraft,
                        accessToken
                    );
                } else if (updatedSettings.blogType === 'page') {
                    bloggerResponse = await this.updateBloggerPage(
                        updatedSettings.blogId,
                        updatedSettings.blogArticleId,
                        updatedSettings.blogTitle,
                        content,
                        accessToken
                    );
                }
            }

            const newFrontmatter = this.makeFrontmatterData(bloggerResponse, updatedSettings.blogAlias, updatedSettings.blogType);
            
            await updateFrontmatter(activeFile, this.vault, newFrontmatter);

            new Notice('Upload completed successfully.');

            if (this.settings.openBrowserAfterPublish) {
                if (bloggerResponse.url) {
                    const { shell } = require('electron');
                    shell.openExternal(bloggerResponse.url);
                    new Notice('Opening published post in browser.');
                } else {
                    new Notice('Unable to open post: URL not available.');
                }
            }

        } catch (error) {
            console.error('Error publishing to Blogspot:', error);
            new Notice('Error publishing to Blogspot. Check console for details.');
        }
    }

    private async openPostSettingsModal(initialData: PostSettings): Promise<PostSettings | null> {
        return new Promise((resolve) => {
            const modal = new PostSettingsModal(this.app, this.settings, initialData, (resultData: PostSettings | null) => {
                resolve(resultData);
            });
            modal.open();
        });
    }

    private async getFrontMatter(file: TFile): Promise<Record<string, string> | null> {
        const fileContent = await this.vault.read(file);
        const frontMatterRegex = /---([\s\S]*?)---/m;
        const match = frontMatterRegex.exec(fileContent);

        if (match) {
            const frontmatterContent = match[1];
            const frontmatter: Record<string, string> = {};
            frontmatterContent.split('\n').forEach(line => {
                const separatorIndex = line.indexOf(':');
                if (separatorIndex !== -1) {
                    const key = line.substring(0, separatorIndex).trim();
                    let value = line.substring(separatorIndex + 1).trim();
                    
                    // 값이 따옴표로 감싸져 있는 경우 따옴표 제거
                    if (value.startsWith('"') && value.endsWith('"')) {
                        value = value.slice(1, -1);
                    }
                    
                    if (key && value) {
                        frontmatter[key] = value;
                    }
                }
            });
            return frontmatter;
        }
        
        return null;
    }

    private async createBloggerPost(blogId: string, title: string, content: string, labels: string[], setDraft: string, accessToken: string) {
        const postData: any = {
            kind: "blogger#post",
            blog: { id: blogId },
            title: title,
            content: content
        };

        // 라벨이 비어있지 않은 경우에만 포함
        if (labels && labels.length > 0 && labels.some(label => label.trim() !== '')) {
            postData.labels = labels.filter(label => label.trim() !== '');
        }

        const url = new URL(`https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/`);
        if (setDraft === 'true') {
            url.searchParams.append('isDraft', 'true');
        }

        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(postData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error.message}`);
        }

        return await response.json();
    }

    private async updateBloggerPost(blogId: string, postId: string, title: string, content: string, labels: string[], setDraft: string, accessToken: string) {
        const postData = {
            kind: "blogger#post",
            id: postId,
            blog: { id: blogId },
            title: title,
            content: content,
            labels: labels
        };

        const response = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${blogId}/posts/${postId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(postData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error.message}`);
        }

        return await response.json();
    }

    private async createBloggerPage(blogId: string, title: string, content: string, accessToken: string) {
        const pageData = {
            kind: "blogger#page",
            blog: { id: blogId },
            title: title,
            content: content
        };

        const response = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${blogId}/pages/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(pageData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error.message}`);
        }

        return await response.json();
    }

    private async updateBloggerPage(blogId: string, pageId: string, title: string, content: string, accessToken: string) {
        const pageData = {
            kind: "blogger#page",
            id: pageId,
            blog: { id: blogId },
            title: title,
            content: content
        };

        const response = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${blogId}/pages/${pageId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(pageData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error.message}`);
        }

        return await response.json();
    }

    private makeFrontmatterData(bloggerResponse: any, blogAlias: string, blogType: 'post' | 'page'): BloggerFrontmatter {
        if (!bloggerResponse) {
            throw new Error('Blogger response is undefined or null');
        }

        const formatDate = (date: string) => {
            const dateFormat = this.settings.dateFormat;
            const dateLanguage = this.settings.dateLanguage;
            const correctedFormat = dateFormat
                .replace(/YYYY/g, 'yyyy')
                .replace(/DD/g, 'dd')
                .replace(/\(ddd\)/g, dateLanguage === 'ko' ? '(eee)' : '(EEE)');
            
            const locale = dateLanguage === 'ko' ? ko : enUS;
            return format(new Date(date), correctedFormat, { locale });
        };

        const bloggerFrontmatter: BloggerFrontmatter = {
            blogAlias: blogAlias,
            blogId: bloggerResponse.blog.id,
            blogUrl: new URL(bloggerResponse.url).origin,
            blogType: blogType,
            blogTitle: bloggerResponse.title,
            blogArticleId: bloggerResponse.id,
            blogArticleUrl: bloggerResponse.url,
            blogLabels: bloggerResponse.labels ? bloggerResponse.labels.join(', ') : '',
            blogIsDraft: bloggerResponse.status === 'DRAFT' ? 'true' : 'false',
            blogPublished: formatDate(bloggerResponse.published),
            blogUpdated: formatDate(bloggerResponse.updated),
        };

        return bloggerFrontmatter;
    }
}
