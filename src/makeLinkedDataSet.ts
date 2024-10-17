import { App, TFile, CachedMetadata, Notice } from 'obsidian';
import { MyPluginSettings } from './settings';
import { LinkDataSet } from './types';

export class MakeLinkedDataSet {
    private app: App;
    private excludeExtensions: string[];
    private includePrefixes: string[];  
    // private makeLinksDataSet: boolean;
    // private useOutlinksForLabels: boolean;
    private labelPrefixes: string[];    
    private excludeTagsContaining: string[];
    constructor(app: App, settings: MyPluginSettings) {
        this.app = app;
        // this.makeLinksDataSet = settings.makeLinksDataSet;
        // this.useOutlinksForLabels = settings.useOutlinksForLabels;
        this.excludeExtensions = settings.excludeLinkExtensions.split(',').map(ext => ext.trim());
        this.includePrefixes = settings.includeLinkPrefixes.split(',').map(prefix => prefix.trim());
        this.labelPrefixes = settings.labelPrefixes.split(',').map(label => label.trim());
        this.excludeTagsContaining = settings.excludeTagsContaining.split(',').map(tag => tag.trim());
    }

    private filterLinks(links: string[]): string[] {
        // 1. 중복 제거
        let uniqueLinks = Array.from(new Set(links));
        
        uniqueLinks = uniqueLinks.map(link => {
            const lastSlashIndex = link.lastIndexOf('/');
            return lastSlashIndex !== -1 ? link.slice(lastSlashIndex + 1) : link;
        });

        // 2. 특정 prefix로 시작하는 링크만 선택
        const prefixFilteredLinks = this.includePrefixes.length > 0
            ? uniqueLinks.filter(link => this.includePrefixes.some(prefix => link.startsWith(prefix)))
            : uniqueLinks;

        // 4. 특정 확장자 링크 제거
        const extensionFilteredLinks = prefixFilteredLinks.filter(link => 
            !this.excludeExtensions.some(ext => link.endsWith(`.${ext}`))
        );

        return extensionFilteredLinks;
    }

    private getBacklinks(file: TFile): string[] {
        const backlinks = this.app.metadataCache.getBacklinksForFile(file);
        const filteredBacklinks = this.filterLinks(Array.from(backlinks.keys()));
        return filteredBacklinks;
    }

    private getFileCache(file: TFile): CachedMetadata {
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache) throw new Error("File cache not found");
        return cache;
    }

    private getOutlinksFromCache(fileCache: CachedMetadata): string[] {
        const fromtmatterLinks = fileCache.frontmatterLinks?.map(link => this.addExtension(link.link));
        const contentLinks = fileCache.links?.map(link => this.addExtension(link.link));
        const outlinks = [...(fromtmatterLinks ?? []), ...(contentLinks ?? [])];
        const filteredOutlinks = this.filterLinks(outlinks);    
        return filteredOutlinks;
    }
    
    private addExtension(link: string): string {
        // 이미 확장자가 있는 경우 그대로 반환
        if (link.includes('.')) {
            return link;
        }
        
        // Obsidian의 기본 노트 확장자인 .md를 추가
        return `${link}.md`;
    }

    private getLabelsFromCache(fileCache: CachedMetadata): string[] {
        const contentLinks = fileCache.links?.map(link => link.link) ?? [];
        const labels = contentLinks.filter(link => 
            this.labelPrefixes.some(prefix => link.toLowerCase().startsWith(prefix.toLowerCase()))
        );
        return labels;
    }

    private getTagsFromCache(fileCache: CachedMetadata): string[] {
        const tags = fileCache.tags?.map(tag => tag.tag) ?? [];
        const filteredTags = this.filterTags(tags);
        return filteredTags;
    }

    private filterTags(tags: string[]): string[] {
        const filteredTags = tags.filter(tag => 
            !this.excludeTagsContaining.some(exclude => tag.includes(exclude))
        );
        return Array.from(new Set(filteredTags));
    }

    private removeExtension(filename: string): string {
        return filename.replace(/\.[^/.]+$/, "");
    }

    makeConnectionDataSet(file: TFile): LinkDataSet {
        if (!file) {
            new Notice('No active file found.');
            return { backlinks: [], outlinks: [], labels: [], tags: [] };
        }
        const fileCache = this.getFileCache(file);
        const backlinks = this.getBacklinks(file);
        const outlinks = this.getOutlinksFromCache(fileCache);
        const labels = this.getLabelsFromCache(fileCache);
        const tags = this.getTagsFromCache(fileCache);
        
        return { backlinks, outlinks, labels, tags };
    }

    private createLinkHtml(filename: string, linkClass: string): string | null {
        const path = this.getPathFromFileName(filename);
        const file = this.app.vault.getAbstractFileByPath(path);

        if (!(file instanceof TFile)) return null;
        
        const fileCache = this.app.metadataCache.getFileCache(file);

        const blogArticleUrl = fileCache?.frontmatter?.blogArticleUrl;
        const displayName = fileCache?.frontmatter?.blogTitle;
        return blogArticleUrl ? `<a href="${blogArticleUrl}" class="${linkClass} hiddenlink hidden">${displayName}</a>` : null;
    }

    private getPathFromFileName(filename: string): string {
        // 볼트의 모든 파일을 가져옵니다
        const files = this.app.vault.getFiles();
        
        // 주어진 파일명과 일치하는 파일을 찾습니다
        const file = files.find((file: TFile) => file.name === filename);
        
        // 파일을 찾으면 경로를 반환하고, 찾지 못하면 null을 반환합니다
        return file ? file.path : "";
    }

    public linkedDataSetToHiddenLinksHtml(linkDataSet: LinkDataSet): string {
        const backlinksHtml = linkDataSet.backlinks
            .map(filename => this.createLinkHtml(filename, 'backlink'))
            .filter(link => link !== null)
            .join('\n');

        const outlinksHtml = linkDataSet.outlinks
            .map(filename => this.createLinkHtml(filename, 'outlink'))
            .filter(link => link !== null)
            .join('\n');


        const relatedLinksHeading = '<h2 class="hidden link-heading">Related Links</h2>\n';
        const backlinksHeading = '<h3 class="hidden link-heading">Backlinks</h3>\n';
        const outlinksHeading = '<h3 class="hidden link-heading">Outlinks</h3>\n';
        
        const sections = [];

        if (backlinksHtml || outlinksHtml) {
            sections.push(relatedLinksHeading);
        }
        if (backlinksHtml) {
            sections.push(backlinksHeading + backlinksHtml);
        }
        if (outlinksHtml) {
            sections.push(outlinksHeading + outlinksHtml);
        }

        
        return sections.join('');
    }

    // 필터 설정을 변경하는 메서드들
    setExcludeExtensions(extensions: string[]): void {
        this.excludeExtensions = extensions;
    }

    setIncludePrefixes(prefixes: string[]): void {
        this.includePrefixes = prefixes;
    }
}
