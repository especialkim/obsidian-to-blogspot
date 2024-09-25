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

    public async publishQuickUpdate(): Promise<void> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No active file');
            return;
        }
    
        try {
            const accessToken = await this.getAccessToken();
            const htmlBundle = await this.markdownToHtml.markdownToHtmlBundle();
    
            const { title, content, labels, tags } = this.extractContentData(htmlBundle);
            const processedLabels = this.processLabels(labels, tags);
    
            const frontMatter = await this.getFrontMatter(activeFile);
            if (!frontMatter || !frontMatter.blogArticleId) {
                new Notice('No existing blog post found. Please use full publish for the first time.');
                return;
            }
    
            // Use existing frontmatter data instead of opening a modal
            const updatedSettings: PostSettings = {
                blogAlias: frontMatter.blogAlias || '',
                blogId: frontMatter.blogId || '',
                blogUrl: frontMatter.blogUrl || '',
                blogType: (frontMatter.blogType as 'post' | 'page') || 'post',
                blogTitle: title, // Use the current title from the markdown
                blogArticleId: frontMatter.blogArticleId,
                blogArticleUrl: frontMatter.blogArticleUrl || '',
                blogLabels: processedLabels.join(', '),
                blogIsDraft: frontMatter.blogIsDraft as 'true' | 'false' || 'false',
                blogPublished: frontMatter.blogPublished || '',
                blogUpdated: frontMatter.blogUpdated || '',
            };
    
            const bloggerResponse = await this.handleBloggerResponse(frontMatter, updatedSettings, content, accessToken);
    
            const newFrontmatter = this.makeFrontmatterData(bloggerResponse, updatedSettings.blogAlias, updatedSettings.blogType);
            await updateFrontmatter(activeFile, this.vault, newFrontmatter);
    
            new Notice('Quick update completed successfully.');
            await this.handlePostPublish(bloggerResponse);
    
        } catch (error) {
            console.error('Error quick updating to Blogspot:', error);
            new Notice('Error quick updating to Blogspot. Check console for details.');
        }
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

            const { title, content, labels, tags } = this.extractContentData(htmlBundle);
            const processedLabels = this.processLabels(labels, tags);

            const frontMatter = await this.getFrontMatter(activeFile);
            const initialModalData = this.initializeFrontMatter(frontMatter, title, processedLabels);

            const updatedSettings = await this.openPostSettingsModal(initialModalData);
            if (updatedSettings === null) {
                new Notice('Publishing cancelled');
                return;
            }

            const bloggerResponse = await this.handleBloggerResponse(frontMatter, updatedSettings, content, accessToken);

            const newFrontmatter = this.makeFrontmatterData(bloggerResponse, updatedSettings.blogAlias, updatedSettings.blogType);
            await updateFrontmatter(activeFile, this.vault, newFrontmatter);

            new Notice('Upload completed successfully.');
            await this.handlePostPublish(bloggerResponse);

        } catch (error) {
            console.error('Error publishing to Blogspot:', error);
            new Notice('Error publishing to Blogspot. Check console for details.');
        }
    }

    private extractContentData(htmlBundle: any) {
        const title = htmlBundle.title;
        const content = htmlBundle.content;
        const labels = htmlBundle.labels;
        const tags = htmlBundle.tags;
        return { title, content, labels, tags };
    }

    private processLabels(labels: string[], tags: string[]): string[] {
        if (!this.settings.useOutlinksForLabels) {
            return tags.map(tag => tag.replace("#", ''));
        } else {
            return labels.map(label => label.replace(this.settings.labelPrefixes + ' ', ''));
        }
    }

    private initializeFrontMatter(frontMatter: Record<string, string> | null, title: string, labels: string[]): PostSettings {
        const blogAlias = frontMatter?.blogAlias || '';
        const blogId = frontMatter?.blogId || '';
        const blogUrl = frontMatter?.blogUrl || '';
        const blogType = frontMatter?.blogType || 'post';
        const blogTitle = frontMatter?.blogTitle || title.replace(/\.[^/.]+$/, ""); // Remove file extension from title
        const blogArticleId = frontMatter?.blogArticleId || '';
        const blogArticleUrl = frontMatter?.blogArticleUrl || '';
        const blogLabels = frontMatter?.blogLabels || labels.join(', ');
        const blogIsDraft = frontMatter?.blogIsDraft || 'false';
        const blogPublished = frontMatter?.blogPublished || '';
        const blogUpdated = frontMatter?.blogUpdated || '';

        return {
            blogAlias,
            blogId,
            blogUrl,
            blogType: blogType as 'post' | 'page',
            blogTitle,
            blogArticleId,
            blogArticleUrl,
            blogLabels,
            blogIsDraft: blogIsDraft as 'true' | 'false',
            blogPublished,
            blogUpdated,
        };
    }

    private async handleBloggerResponse(frontMatter: Record<string, string> | null, updatedSettings: PostSettings, content: string, accessToken: string) {
        if (frontMatter === null || !updatedSettings.blogArticleId) {
            return await this.createNewBlogPostOrPage(updatedSettings, content, accessToken);
        } else {
            return await this.updateExistingBlogPostOrPage(updatedSettings, content, accessToken);
        }
    }

    private async createNewBlogPostOrPage(updatedSettings: PostSettings, content: string, accessToken: string) {
        if (updatedSettings.blogType === 'post') {
            return await this.createBloggerPost(
                updatedSettings.blogId,
                updatedSettings.blogTitle,
                content,
                updatedSettings.blogLabels ? updatedSettings.blogLabels.split(',').map(label => label.trim()).filter(label => label !== '') : [],
                updatedSettings.blogIsDraft,
                accessToken
            );
        } else if (updatedSettings.blogType === 'page') {
            return await this.createBloggerPage(
                updatedSettings.blogId,
                updatedSettings.blogTitle,
                content,
                accessToken
            );
        }
        throw new Error('Unsupported blog type');
    }

    private async updateExistingBlogPostOrPage(updatedSettings: PostSettings, content: string, accessToken: string) {
        if (updatedSettings.blogType === 'post') {
            return await this.updateBloggerPost(
                updatedSettings.blogId,
                updatedSettings.blogArticleId,
                updatedSettings.blogTitle,
                content,
                updatedSettings.blogLabels.split(',').map(label => label.trim()),
                updatedSettings.blogIsDraft,
                accessToken
            );
        } else if (updatedSettings.blogType === 'page') {
            return await this.updateBloggerPage(
                updatedSettings.blogId,
                updatedSettings.blogArticleId,
                updatedSettings.blogTitle,
                content,
                accessToken
            );
        }
        throw new Error('Unsupported blog type');
    }

    private async handlePostPublish(bloggerResponse: any) {
        if (this.settings.openBrowserAfterPublish) {
            if (bloggerResponse.url) {
                const { shell } = require('electron');
                shell.openExternal(bloggerResponse.url);
                new Notice('Opening published post in browser.');
            } else {
                new Notice('Unable to open post: URL not available.');
            }
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
        const frontMatterRegex = /^---\s*\n([\s\S]*?)\n---/m;
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
        // Check for empty required fields
        if (!title.trim()) {
            throw new Error('Post title cannot be empty');
        }
        if (!content.trim()) {
            throw new Error('Post content cannot be empty');
        }

        const postData: any = {
            kind: "blogger#post",
            id: postId,
            blog: { id: blogId },
            title: title.trim(),
            content: content.trim()
        };

        // Only include labels if they are not empty
        if (labels && labels.length > 0 && labels.some(label => label.trim() !== '')) {
            postData.labels = labels.filter(label => label.trim() !== '');
        }

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
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorData.error.message}, details: ${JSON.stringify(errorData)}`);
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

    // Additional helper methods can be defined below to further modularize the code
}
