export interface LinkDataSet {
    backlinks: string[];
    outlinks: string[];
    labels: string[];
    tags: string[];
}

export interface PreprocessResult {
    content: string;
    linkDataSet: LinkDataSet;
}

export interface HtmlBundle {
    title: string;
    content: string;
    labels: string[];
    tags: string[];
    hiddenLinks: string;
}

