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
        const uniqueLinks = Array.from(new Set(links));

        // 2. 특정 prefix로 시작하는 링크만 선택
        const prefixFilteredLinks = this.includePrefixes.length > 0
            ? uniqueLinks.filter(link => this.includePrefixes.some(prefix => link.startsWith(prefix)))
            : uniqueLinks;

        // 3. 특정 확장자 링크 제거
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
        const fromtmatterLinks = fileCache.frontmatterLinks?.map(link => link.link);
        const contentLinks = fileCache.links?.map(link => link.link);
        const outlinks = [...(fromtmatterLinks ?? []), ...(contentLinks ?? [])];
        const filteredOutlinks = this.filterLinks(outlinks);    
        return filteredOutlinks;
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

    makeConnectionDataSet(): LinkDataSet {
        const file = this.app.workspace.getActiveFile();
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

    public linkedDataSetToHiddenLinksHtml(linkDataSet: LinkDataSet): string {
        const backlinksHtml = linkDataSet.backlinks
            .map(filename => {
                const file = this.app.vault.getAbstractFileByPath(filename);
                if (!(file instanceof TFile)) return null;
                const postUrl = this.app.metadataCache.getFileCache(file)?.frontmatter?.PostUrl;
                return postUrl ? `<a href="${postUrl}" class="backlink hiddenlink">${file.name}</a>` : null;
            })
            .filter(link => link !== null)
            .join('\n');

        const outlinksHtml = linkDataSet.outlinks
            .map(filename => {
                const file = this.app.vault.getAbstractFileByPath(filename);
                if (!(file instanceof TFile)) return null;
                const postUrl = this.app.metadataCache.getFileCache(file)?.frontmatter?.PostUrl;
                return postUrl ? `<a href="${postUrl}" class="outlink hiddenlink">${file.name}</a>` : null;
            })
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
