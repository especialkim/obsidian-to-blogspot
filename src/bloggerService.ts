import { PostSettingsModal, PostSettings } from './modals';
import { GoogleOauth } from './googleOauth';
import { MarkdownToHtml } from './markdownToHtml';
import { Vault, App, Notice, TFile } from 'obsidian';
import { MyPluginSettings } from './settings';

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

    public async publish(): Promise<void> {

        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('No active file');
            return;
        }

        try {
            const oauthToken = await this.googleOauth.getGoogleAuthToken();
            const htmlBundle = await this.markdownToHtml.markdownToHtmlBundle();

            const title = htmlBundle.title;
            let content = htmlBundle.content;
            const hiddenLinks = htmlBundle.hiddenLinks;
            let labels = htmlBundle.labels;
            const tags = htmlBundle.tags;

            if (this.settings.makeLinksDataSet) {
                content = content + hiddenLinks;
            }

            if (!this.settings.useOutlinksForLabels) {
                labels = tags.map(tag => tag.replace("#", ''));
            }else{
                labels = labels.map(label => label.replace(this.settings.labelPrefixes + ' ', ''));
            }

            const frontMatter = await this.getFrontMatter(activeFile);

            /*
              frontmatter를 확인
            */
            let blogAlias = frontMatter?.BlogAlias || '';
            let blogId = frontMatter?.BlogId || '';
            let blogType = frontMatter?.BlogType || 'post';
            let blogTitle = frontMatter?.BlogTitle || title.replace(/\.[^/.]+$/, ""); // Remove file extension from title
            let blogLabels = frontMatter?.BlogLabels || labels.join(', ');
            let blogVisibility = frontMatter?.BlogVisibility || 'public';
            let blogUrl = frontMatter?.BlogUrl || '';
            let blogArticleId = frontMatter?.BlogArticleId || '';

            const initialModalData: PostSettings = {
                blogAlias: blogAlias,
                blogId: blogId,
                blogType: blogType as 'post' | 'page',
                blogTitle: blogTitle,
                blogLabels: blogLabels,
                blogVisibility: blogVisibility as 'true' | 'false',
                blogUrl: blogUrl,
                blogArticleId: blogArticleId,
            };

            const updatedSettings = await this.openPostSettingsModal(initialModalData);

            console.log('Updated settings:');
            console.log(updatedSettings);

            /*
                blogId
                blogType
                blogTitle
                blogArticleId
                blogLabels : Only Post
                blogVisibility : Only Post
                content
            */



        } catch (error) {
            console.error('Error publishing to Blogspot:', error);
            new Notice('Error publishing to Blogspot. Check console for details.');
        }
    }

    private async openPostSettingsModal(initialData: PostSettings): Promise<PostSettings> {
        return new Promise((resolve) => {
            const modal = new PostSettingsModal(this.app, this.settings, initialData, (resultData: PostSettings) => {
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
                    const value = line.substring(separatorIndex + 1).trim();
                    if (key && value) {
                        frontmatter[key] = value;
                    }
                }
            });
            return frontmatter;
        }
        
        return null;
    }


    /* body 에 들어가는 속성 : kind, blog, title, content, labels, visibility */
    private async createBloggerPost(){}
    private async updateBloggerPost(){}
    private async createBloggerPage(){}
    private async updateBloggerPage(){}
}



/*

BlogAliases
BlogType : Post or Page
BlogTitle
BlogLabels
BlogID
BlogUrl
BlogArticleID
BlogVisibility
BlogPublished
BlogUpdated

*/