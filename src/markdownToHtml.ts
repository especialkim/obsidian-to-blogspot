import { marked } from 'marked';
import { App, Notice, TFile } from 'obsidian';
import { MarkdownPreprocessing } from './markdownPreprocessing';
import { MyPluginSettings } from './settings';
import { CalloutToHtml } from './calloutToHtml';
import { MakeLinkedDataSet } from './makeLinkedDataSet';
import { HtmlBundle } from './types';
import { normalizePath } from 'obsidian';

export class MarkdownToHtml {
	private app: App;
	private settings: MyPluginSettings;
    private markdownPreprocessing: MarkdownPreprocessing;
	private includeCssInPublish: boolean;

	constructor(app: App, settings: MyPluginSettings) {
		this.app = app;
		this.settings = settings;
		this.markdownPreprocessing = new MarkdownPreprocessing(app, settings);
		this.includeCssInPublish = this.settings.includeCssInPublish;
	}

	async convert() {
		const bundle = await this.markdownToHtmlBundle();
		let content = bundle.content;
		const hiddenLinks = bundle.hiddenLinks;

		content = this.convertLatexToHtml(content);

		if(this.settings.makeLinksDataSet){
			content += hiddenLinks;
		}
		
		const html = await this.makeHtmlDocument(content);
		const fileName = await this.createHtmlFile(html);
		await this.openHtmlFile(fileName);
	}

	async markdownToHtmlBundle(): Promise<HtmlBundle> {
		const activeFile = this.app.workspace.getActiveFile();

        if (!activeFile) {
            new Notice('No active file found.');
			return { title: '', content: '', labels: [], tags: [], hiddenLinks: ''}; 
		}

		const fileContent = await this.app.vault.read(activeFile);
		let { content, linkDataSet } = await this.markdownPreprocessing.preprocess(fileContent);

		content = content.replace(/==([^=]+)==/g, '<mark>$1</mark>');
		content = this.convertLatexToHtml(content);

		content = await CalloutToHtml.advancedProcess(content, this.markdownPreprocessing, this);
		// content = await CalloutToHtml.process(content);
		content = await this.convertToHtml(content);
		content = this.restructureNestedLists(content);
		content = this.convertYoutubeLinksToIframes(content);
		content = this.removeParaWrappingFromImages(content);

		if (this.settings.useHtmlWrapClass) {
			const className = this.settings.htmlWrapClassName;
			content = `<div class="${className}">${content}</div>`;
		}

		const title = activeFile.name;
		const labels = linkDataSet.labels;
		const tags = linkDataSet.tags;
		const makeLinkedDataSet = new MakeLinkedDataSet(this.app, this.settings);
		const hiddenLinks = makeLinkedDataSet.linkedDataSetToHiddenLinksHtml(linkDataSet);

		if (this.settings.makeLinksDataSet){
			content = content + hiddenLinks;
		}
		return {title, content, labels, tags, hiddenLinks};
	}

	public async convertToHtml(markdown: string): Promise<string> {
        try {
            marked.setOptions({
                gfm: true,          // GitHub Flavored Markdown 활성화
                breaks: true      // 단일 줄바꿈을 <br>로 변환
            });

            return marked.parse(markdown);


        } catch (err) {
            throw new Error(`Markdown parsing failed: ${err}`);
        }
    }

	public restructureNestedLists(html: string): string {
        // console.log('Before restructuring:', html);

        // 1. <li>{텍스트}<ul> 또는 <li>{텍스트}<ol>를 <li>{텍스트}</li><ul> 또는 <li>{텍스트}</li><ol>로 변경 (이미 </li>가 있는 경우 제외)
        html = html.replace(/(<li[^>]*>)((?:(?!<\/li>).)*?)(<[ou]l>)/g, '$1$2</li>\n$3');

        // 2. </ul> 또는 </ol> {공백 또는 줄바꿈~~} </li> 를 </ul> 또는 </ol>로 대치
        html = html.replace(/<\/([ou]l)>\s*<\/li>/g, '</$1>');

        // console.log('After restructuring:', html);

        return html;
    }

    public convertYoutubeLinksToIframes(html: string): string {
        const youtubeRegex = /<img\s+src="(https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)(\S*))"\s+alt="(.*)"\s*\/?>/g;
        return html.replace(youtubeRegex, (match, url, _, __, videoId, params, alt) => {
            const embedUrl = `https://www.youtube.com/embed/${videoId}${params}`;
            return `<div class="youtube-embed-wrapper"><iframe class="youtube-embed" src="${embedUrl}" title="${alt}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
        });
    }

	public removeParaWrappingFromImages(content: string): string {
		return content.replace(/<p>\s*(<img[^>]+>)\s*<\/p>/g, '$1');
	}

	private async makeHtmlDocument(htmlBody: string): Promise<string> {
		const activeFile = this.app.workspace.getActiveFile();
		const title = activeFile ? activeFile.name : 'Document';

		return `
		<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>${title}</title>
			<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.7/dist/katex.min.css">
			<style>
				${await this.getCssCode()}
			</style>
			<!-- MathJax 설정을 먼저 정의 -->
			<script type='text/x-mathjax-config'>
				MathJax.Hub.Config({
					tex2jax: {
						inlineMath: [['$', '$']],
						displayMath: [['$$', '$$']],
						// 정규 표현식을 사용하여 클래스 이름에 'math'가 포함된 모든 요소를 처리하도록 설정
						processClass: /(^| )math( |$)/,
						ignoreClass: "no-math"
					}
				});
			</script>
			<!-- MathJax 라이브러리 로드 -->
			<script async='async' src='https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.7/MathJax.js?config=TeX-MML-AM_CHTML' type='text/javascript'>
			</script>
		</head>
		<body>
			${htmlBody}
		</body>
		<script>
			// CodeBlock 복사하기

			document.querySelectorAll('pre:has(code)').forEach(preElement => {
				// code 요소의 클래스명을 읽어와서 표시할 div 생성
				const codeElement = preElement.querySelector('code');
				const className = codeElement.className.replace('language-', '').charAt(0).toUpperCase() + codeElement.className.replace('language-', '').slice(1);

				// 클래스명을 표시하는 요소 생성
				const classDiv = document.createElement('div');
				classDiv.className = 'class-name';
				classDiv.textContent = className;
				preElement.appendChild(classDiv);

				// 복사 버튼 생성
				const copyButton = document.createElement('button');
				copyButton.className = 'copy-btn';
				copyButton.textContent = '📄 Copy';
				preElement.appendChild(copyButton);

				// 복사 버튼 클릭 이벤트 리스너 추가
				copyButton.addEventListener('click', () => {
					const code = codeElement.innerText.trim();

					navigator.clipboard.writeText(code).then(() => {
						// 버튼 텍스트를 '📄 Copied'로 변경
						copyButton.textContent = '📄 Copied';
						setTimeout(() => {
							copyButton.textContent = '📄 Copy'; // 원래 텍스트로 복구
						}, 2000); // 2초 후에 텍스트 원래대로 복구
					}).catch(err => {
						console.error('복사 실패:', err);
					});
				});
			});
		</script>
		<button id="theme-toggle">Toggle Theme</button>
		<script>
			const toggleButton = document.getElementById('theme-toggle');
			toggleButton.addEventListener('click', () => {
				const currentTheme = document.documentElement.getAttribute('data-theme');
				const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
				document.documentElement.setAttribute('data-theme', newTheme);
			});
		</script>
		</html>
		`
	}

	private async getCssCode(): Promise<string> {
		if (!this.includeCssInPublish) {
			return '';
		}

		if (!this.settings.cssFilePath || this.settings.cssFilePath.trim() === '') {
			return this.getDefaultCssCode();
		}

		const cssFile = this.app.vault.getAbstractFileByPath(this.settings.cssFilePath);
		if (!(cssFile instanceof TFile)) {
			console.warn(`CSS file not found: ${this.settings.cssFilePath}`);
			return this.getDefaultCssCode();
		}

		try {
			return await this.app.vault.read(cssFile);
		} catch (error) {
			console.error(`Error reading CSS file: ${error}`);
			return this.getDefaultCssCode();
		}
	}

	private async createHtmlFile(html: string): Promise<string> {
		const fileName = 'output.html';
		const filePath = normalizePath(fileName);
		
		try {
			// Create or overwrite the HTML file in the vault
			await this.app.vault.adapter.write(filePath, html);
		} catch (error) {
			console.error('Error writing file:', error);
		}

		return fileName;
	}

	private async openHtmlFile(fileName: string): Promise<void> {
		// Open the HTML file in the default browser
		const file = this.app.vault.getAbstractFileByPath(fileName);
		if (file) {
			this.app.workspace.openLinkText(fileName, '', false, { active: true });
		} else {
			console.error('File not found:', fileName);
		}
	}
	
	private convertLatexToHtml(markdown: string): string {
		// First, handle inline LaTeX ($...$), but not \$...\$ and not inside $$...$$
		let result = markdown.replace(/(?<!\$)(?<!\\)\$(?!\$)((?:[^\$\\]|\\.)*?[^\\])\$(?!\$)/g, (match, latex) => {
			return `<span class="math math-inline">$${latex}$</span>`;
		});

		// Then, handle block LaTeX ($$...$$)
		result = result.replace(/(\$\$)([\s\S]*?)(\$\$)/g, (match, start, latex, end) => {
			return `<div class="math math-display">${start}${latex}${end}</div>`;
		});

		return result;
	}


	private getDefaultCssCode(): string {
		return `
		@import url("https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.8/dist/web/static/pretendard-dynamic-subset.css");

    :root {
    /* 색상 변수 */
    --fantasy-background-color-rgb: 240, 240, 240; /* 밝은 회색으로 변경 */

    --background-color: #EBEBEB;
    --background-color-splitter: #E0E0E0;

    --background-tab-primary: rgba(240, 240, 240, 0.3);
    --background-tab-primary-alt: rgba(240, 240, 240, 0.15);
    
    --color-base-00: #FFFFFF; /* 배경색 */
    --color-base-05: #F0F0F0; /* 연한 회색 */
    --color-base-10: #E0E0E0; /* 연한 회색 */
    --color-base-20: #D0D0D0; /* 중간 회색 */
    --color-base-25: #C0C0C0; /* 중간 회색 */
    --color-base-30: #B0B0B0; /* 중간 회색 */
    --color-base-35: #A0A0A0; /* 중간 회색 */
    --color-base-40: #909090; /* 어두운 회색 */
    --color-base-45: #808080; /* 어두운 회색 */
    --color-base-50: #707070; /* 어두운 회색 */
    --color-base-55: #606060; /* 어두운 회색 */
    --color-base-60: #505050; /* 어두운 회색 */
    --color-base-65: #404040; /* 어두운 회색 */
    --color-base-70: #303030; /* 매우 어두운 회색 */
    --color-base-75: #202020; /* 매우 어두운 회색 */
    --color-base-80: #101010; /* 거의 검정색 */
    --color-base-85: #0A0A0A; /* 거의 검정색 */
    --color-base-90: #050505; /* 거의 검정색 */
    --color-base-95: #000000; /* 검정색 */
    --color-base-100: #000000; /* 검정색 */
    --color-base-200: #000000; /* 대비를 위한 흰색 */

    --line-color: #CCCCCC;

    --height-tab-bar: 35px;

    --width-container: 750px;
    --width-sidebar: 280px;
    --width-splitter: 4px;
    --width-ribbon: calc(var(--height-tab-bar) + 1px);
    --width-tab-button: 20px;

    --height-status-bar: 34px;

    --gap: 8px;
    --radius: 10px;
    --radius-ribbon: 16px;

    --text-color: var(--color-base-85); /* 어두운 텍스트 색상으로 변경 */
    --text-size: 15px;

    /* Markdown */
    --file-line-width: 720px;

    /* 강조 색상 */
    --accent-hsl: 210, 100%, 50%; /* 파란색 계열로 변경 */
    --accent-h: 210;
    --accent-s: 100%;
    --accent-l: 50%;

    --color-accent: hsl(var(--accent-h), var(--accent-s), var(--accent-l));
    --color-accent-20: hsl(calc(var(--accent-h) + 20), calc(var(--accent-s) + 25%), var(--accent-l));
    --color-accent-35: hsl(calc(var(--accent-h) + 35), calc(var(--accent-s) + 25%), var(--accent-l));
    --color-accent-35-opacity: hsla(calc(var(--accent-h) + 35), calc(var(--accent-s) + 25%), var(--accent-l), 0.3);

    /* 무지개 색상 */
    --rainbow-color-01: #f8bfbf;
    --rainbow-color-02: #f3c494;
    --rainbow-color-03: #d4d517;
    --rainbow-color-04: #7fe619;
    --rainbow-color-05: #43eb43;
    --rainbow-color-06: #38e991;
    --rainbow-color-07: #19e4e5;
    --rainbow-color-08: #add1f6;
    --rainbow-color-09: #cacaf9;
    --rainbow-color-10: #e5bff8;
    --rainbow-color-11: #f7b8f7;
    --rainbow-color-12: #f8bbd9;

    /* 구분선 색상 */
    --divider-color: var(--color-base-55);

    /* 헤딩 색상 */
    --h1-color: #1E90FF; /* 다채로운 파란색 (Dodger Blue) */
    --h2-color: #1E90FF; /* 중간 파란색 */
    --h3-color: #1E90FF; /* 어두운 파란색 */
    --h4-color: #1E90FF; /* 더 어두운 파란색 */
    --h5-color: #1E90FF; /* 깊은 파란색 */
    --h6-color: #1E90FF; /* 매우 깊은 파란색 */

    /* 헤딩 크기 */
    --h1-size: 1.3em;
    --h2-size: 1.2em;
    --h3-size: 1.15em;
    --h4-size: 1.1em;
    --h5-size: 1.05em;
    --h6-size: 1.05em;

    --heading-spacing: calc(var(--p-spacing) * 2.5);
    --heading-font-weight: 600;
   
    /* 블록 인용구 */
    --blockquote-border-radius: 4px;
    --blockquote-background-font-size: 0.96em;
    --blockquote-background-color: rgba(var(--fantasy-background-color-rgb), 0.1); /* 투명도 낮춤 */
    --blockquote-border-color: hsl(var(--accent-h), var(--accent-s), calc(var(--accent-l) + 15%));
    --blockquote-color: var(--color-base-80);
    --blockquote2-color: var(--color-base-55);
    --blockquote2-font-size: 0.93em;
    --blockquote2-background-color: rgba(var(--fantasy-background-color-rgb), 0.1); /* 투명도 낮춤 */
    
    /* 콜아웃 색상 */
    --callout-bug: 208, 71, 69;
    --callout-default: 105, 105, 218;
    --callout-error: 208, 71, 69;
    --callout-example: 150, 88, 213;
    --callout-fail: 208, 71, 69;
    --callout-important: 33, 130, 130;
    --callout-info: 105, 105, 218;
    --callout-question: 166, 104, 42;
    --callout-success: 34, 135, 34;
    --callout-summary: 33, 130, 130;
    --callout-tip: 33, 130, 130;
    --callout-todo: 105, 105, 218;
    --callout-warning: 166, 104, 42;
    --callout-quote: 158, 158, 158;
    
    --callout-border-width: 4px;
    --callout-border-opacity: 0.6;
    --callout-content-background: rgba(var(--fantasy-background-color-rgb), 0.2); /* 투명도 조정 */

    /* 코드 스타일 */
    --inline-code-color: var(--color-accent-20);
    --code-background: rgba(137, 121, 121, 0.42);
    --code-size: 0.95em;
    --codeblock-background: rgba(24, 22, 22, 0.42);
    --codeblock-header: rgba(24, 22, 22, 0.7);

    /* 이미지 */
    --img-mask: 7px;

    /* 간격 */
    --p-spacing: 0.5rem;

    /* 리스트 스타일 */
    --list-spacing: 0.075em;
    --list-indent: 1.5em;
    --list-line-color: var(--color-base-60);
    --list-line-color-hover: var(--color-base-100);

    --bold-color: var(--color-accent-20);
    --italic-color: var(--color-accent-35);
    --highlight-text-color: var(--color-base-200);
    --highlight-color: var(--color-accent-35-opacity);

    /* 테이블 스타일 */
    --table-text-size: 0.9em;
    --table-bg-color: rgba(var(--fantasy-background-color-rgb), 0.2);
    --table-border-color: var(--text-color);
    --table-odd-row-bg-color: rgba(var(--fantasy-background-color-rgb), 0.4);

    /* 방문한 링크 색상 */
    --visited-link-color: #551A8B; /* 예시 색상 */
}

/* 다크 모드 변수 */
[data-theme="dark"] {
    --fantasy-background-color-rgb: 15, 29, 17; /* 기존의 어두운 녹색 */

    --background-color: #1c1818d4;
    --background-color-splitter: #333;

    --background-tab-primary: rgba(6, 13, 18, 0.3);
    --background-tab-primary-alt: rgba(6, 13, 18, 0.15);

    /* 무지개 색상 */
    --rainbow-color-01: #f8bfbf;
    --rainbow-color-02: #f3c494;
    --rainbow-color-03: #d4d517;
    --rainbow-color-04: #7fe619;
    --rainbow-color-05: #43eb43;
    --rainbow-color-06: #38e991;
    --rainbow-color-07: #19e4e5;
    --rainbow-color-08: #add1f6;
    --rainbow-color-09: #cacaf9;
    --rainbow-color-10: #e5bff8;
    --rainbow-color-11: #f7b8f7;
    --rainbow-color-12: #f8bbd9;
    
    --color-base-00: #1e1e1e;
    --color-base-05: #212121;
    --color-base-10: #242424;
    --color-base-20: #262626;
    --color-base-25: #2a2a2a;
    --color-base-30: #363636;
    --color-base-35: #3f3f3f;
    --color-base-40: #555555;
    --color-base-45: #505050;
    --color-base-50: #666666;
    --color-base-55: #7d7d7d;
    --color-base-60: #999999;
    --color-base-65: #909090;
    --color-base-70: #a0a0a0;
    --color-base-75: #a5a5a5;
    --color-base-80: #b5b5b5;
    --color-base-85: #c0c0c0;
    --color-base-90: #cccccc;
    --color-base-95: #d6d6d6;
    --color-base-100: #dadada;
    --color-base-200: #FFFFFF;

    --text-color: var(--color-base-85);

    /* 강조 색상 */
    --accent-hsl: 30, 100%, 50%; /* 주황색 계열로 변경 */
    --accent-h: 30;
    --accent-s: 100%;
    --accent-l: 50%;

    --color-accent: hsl(var(--accent-h), var(--accent-s), var(--accent-l));
    --color-accent-20: hsl(calc(var(--accent-h) + 20), calc(var(--accent-s) + 25%), var(--accent-l));
    --color-accent-35: hsl(calc(var(--accent-h) + 35), calc(var(--accent-s) + 25%), var(--accent-l));
    --color-accent-35-opacity: hsla(calc(var(--accent-h) + 35), calc(var(--accent-s) + 25%), var(--accent-l), 0.6);

    /* 헤딩 색상 */
    --h1-color: var(--rainbow-color-03);
    --h2-color: var(--rainbow-color-04);
    --h3-color: var(--rainbow-color-05);
    --h4-color: var(--rainbow-color-06);
    --h5-color: var(--rainbow-color-07);
    --h6-color: var(--rainbow-color-08);


    /* 블록 인용구 */
    --blockquote-background-color: rgba(var(--fantasy-background-color-rgb), 0.4);
    --blockquote-border-color: hsla(var(--accent-h), var(--accent-s), calc(var(--accent-l) + 15%), 0.8);
    --blockquote-color: var(--color-base-80);
    --blockquote2-color: var(--color-base-55);
    --blockquote2-font-size: 0.93em;
    --blockquote2-background-color: rgba(var(--fantasy-background-color-rgb), 0.4);

    /* 콜아웃 색상 */
    --callout-default: 105, 105, 218;
    --callout-bug: 208, 71, 69;
    --callout-error: 208, 71, 69;
    --callout-example: 150, 88, 213;
    --callout-fail: 208, 71, 69;
    --callout-important: 33, 130, 130;
    --callout-info: 105, 105, 218;
    --callout-question: 166, 104, 42;
    --callout-success: 34, 135, 34;
    --callout-summary: 33, 130, 130;
    --callout-tip: 33, 130, 130;
    --callout-todo: 105, 105, 218;
    --callout-warning: 166, 104, 42;
    --callout-quote: 158, 158, 158;

    --callout-content-background: rgba(var(--fantasy-background-color-rgb), 0.3); /* 다크 모드에서는 투명도 증가 */
}

/* 반응형 테마 감지 */
@media (prefers-color-scheme: dark) {
    :root {
        /* 다크 모드 변수에 대한 기본 설정 대신 data-theme="dark"로 제어하는 방식 사용 */
    }
}

body {
    margin: auto;
    max-width: var(--width-container);
    background-color: var(--background-color);
    color: var(--text-color);
    font-size: var(--text-size);
    line-height: 1.4;
    font-family: "Pretendard Variable", Pretendard;
    font-weight: 300;
}

h1, h2, h3, h4, h5, h6 {
    margin-block-start: var(--p-spacing);
    margin-block-end: var(--p-spacing);
    font-weight: var(--heading-font-weight);
}

h1{
  --p-spacing: var(--h1-size);
  font-size: var(--h1-size);    
  color: var(--h1-color);
}
h2{
  --p-spacing: var(--h2-size);
  font-size: var(--h2-size);    
  color: var(--h2-color);
}
h3{
  --p-spacing: var(--h3-size);
  font-size: var(--h3-size);    
  color: var(--h3-color);
}
h4{
  --p-spacing: var(--h4-size);
  font-size: var(--h4-size);    
  color: var(--h4-color);
}
h5{
  --p-spacing: var(--h5-size);
  font-size: var(--h5-size);    
  color: var(--h5-color);
}
h6{
  --p-spacing: var(--h6-size);
  font-size: var(--h6-size);    
  color: var(--h6-color);
}
h1, h2, h3, h4, h5, h6{
  margin-block-start: var(--p-spacing);
  margin-block-end: var(--p-spacing);
  font-weight: var(--heading-font-weight);
}
h1:first-child{
  margin-block-start: 0;
}

h2{
  display: flex;
  align-items: center;
}

h2::after{
  content: "";
  background-color: var(--h2-color);
  height: 1px;
  margin:3px 0px 0px 15px;
  flex-grow:1;
}

h1:first-child {
    margin-block-start: 0;
}

b, strong {
    color: var(--bold-color);
    font-weight: normal;
}

em {
    color: var(--italic-color);
}

mark {
    box-shadow: inset 0 -7px 0 var(--highlight-color);
    background-color: transparent;
    text-decoration: none;
    color: var(--highlight-text-color);
}

strong mark {
    color: var(--bold-color);
}

code {
    background-color: var(--code-background);
    padding: 1px 5px;
    border-radius: 0.2em;
    font-size: 0.9em;
}

hr{
  border: none;
  border-top: 1px solid var(--divider-color);
  color: var(--divider-color);
  margin-top: calc(var(--p-spacing) * 3);
  margin-bottom: calc(var(--p-spacing) * 3);
}

li > code,
p > code {
    color: var(--color-accent-20);
}

pre:has(code) {
    position: relative;
    background-color: var(--codeblock-background);
    border-radius: 5px;
    margin: var(--p-spacing) 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
}

pre:has(code):before {
    display: block;
    content: " ";
    height: 1.8em;
    background-color: var(--codeblock-header);
}

pre:has(code) code {
    padding: 10px 15px;
    font-size: 0.9em;
    line-height: 1.3;
    color: #EBEBEB;
    background-color: initial;
}

pre:has(code) .class-name {
    position: absolute;
    top: 5px;
    left: 0;
    color: #EBEBEB;
    padding: 3px 8px;
    border-radius: 3px;
    font-size: 0.8em;
}

pre:has(code) .copy-btn {
    position: absolute;
    top: 1px;
    right: 5px;
    background-color: transparent;
    color: #EBEBEB;
    border: none;
    border-radius: 3px;
    padding: 3px 8px;
    cursor: pointer;
    transition: background-color 0.3s ease;
    font-size: 0.8em;
}

pre:has(code) .copy-btn:hover,
pre:has(code) .copy-btn:active {
    background-color: black;
}

blockquote {
    margin-inline-start: 0;
    margin-inline-end: 0;
    border-left: 4px solid var(--blockquote-border-color);
    padding: calc(5px + var(--p-spacing)) 5px 5px 10px;
    background-color: var(--blockquote-background-color);
    color: var(--blockquote-color);
    font-size: var(--blockquote-background-font-size);
    font-style: italic;
    border-radius: var(--blockquote-border-radius);
}

ul, ol {
    padding-inline-start: 0;
}

ol {
    counter-reset: item;
}

ol > li {
    counter-increment: item;
    position: relative;
    /* list-style: none; */
    margin-left: var(--list-indent);
    padding-top: var(--list-spacing);
    padding-bottom: var(--list-spacing);
}

/*
ol > li::before {
    content: counter(item) ". ";
    position: absolute;
    left: -17px;
}
*/

ol > li, ul > li {
    padding-top: 2px;
    padding-bottom: 2px;
    margin-inline-start: 1.5em;
}

ul > ol,
ol > ol,
ol > ul,
ul > ul {
    margin-left: 0.5rem;
    padding-left: 1rem;
    border-left: 1px solid var(--list-line-color);
}

ul > ol:hover,
ol > ol:hover,
ol > ul:hover,
ul > ul:hover {
    border-color: var(--list-line-color-hover);
}

ul > ul > li {
    list-style: circle;
}

ul > ul > ul > li {
    list-style: square;
}

ul > ul > ul > ul > li {
    list-style: circle;
}

a, a:visited, a:hover {
    color: var(--color-accent);
    text-decoration: none;
}

a:hover {
    text-decoration: underline;
}

img {
    max-width: 100%;
    max-height: 30vh;
}

table {
    background-color: var(--table-bg-color);
    border-spacing: 0;
    text-align: center;
    font-size: var(--table-text_size);
    margin: auto;
}

th, td {
    padding: 8px 10px 4px 10px;
    border-right: 1px solid var(--table-border-color);
    vertical-align: middle;
}

th {
    border-top: 1px solid var(--table-border-color);
    border-bottom: 2px solid var(--table-border-color);
    padding-bottom: 7px;
}

th:last-child,
td:last-child {
    border-right: none;
}

tr:last-child td {
    border-bottom: 1px solid var(--table-border-color);
}

tbody tr:nth-child(odd) {
    background-color: var(--table-odd-row-bg-color);
}

.callout,
.callout-default {
    --callout: rgba(var(--callout-default), 0.6);
}

.callout.callout-bug { --callout: rgba(var(--callout-bug), 0.6); }
.callout.callout-error { --callout: rgba(var(--callout-error), 0.6); }
.callout.callout-example { --callout: rgba(var(--callout-example), 0.6); }
.callout.callout-fail { --callout: rgba(var(--callout-fail), 0.6); }
.callout.callout-important { --callout: rgba(var(--callout-important), 0.6); }
.callout.callout-info { --callout: rgba(var(--callout-info), 0.6); }
.callout.callout-question { --callout: rgba(var(--callout-question), 0.6); }
.callout.callout-success { --callout: rgba(var(--callout-success), 0.6); }
.callout.callout-summary { --callout: rgba(var(--callout-summary), 0.6); }
.callout.callout-tip { --callout: rgba(var(--callout-tip), 0.6); }
.callout.callout-todo { --callout: rgba(var(--callout-todo), 0.6); }
.callout.callout-warning { --callout: rgba(var(--callout-warning), 0.6); }
.callout.callout-quote { --callout: rgba(var(--callout-quote), 0.6); }

.callout {
    position: relative;
    margin-top: 1rem;
    margin-bottom: 0.5rem;
    border: var(--callout-border-width) solid var(--callout);
    border-radius: 5px;
}

.callout-title {
    font-family: var(--font-title-primary);
    padding: 5px 5px 6px 11px;
    margin-bottom: 0;
    background-color: var(--callout);
    color: #EBEBEB;
    font-size: 0.98em;
    font-weight: 600;
}

.callout-content {
    background-color: var(--callout-content-background);
    padding: 10px 15px;
    color: var(--blockquote-color);
    font-size: 0.95em;
}

.callout p {
    margin-top: 0;
}
.callout ul {
    margin: 0;
}

.callout.callout-flex:has(img) {
  border: 0;
}

.callout.callout-flex:has(img) .callout-title {
  display: none;
}

.callout.callout-flex:not(:has(img)) .callout-content {
  justify-content: flex-start;
  gap: 30px;
}

.callout.callout-flex .callout-content {
  display: flex;
  gap: 15px;
  justify-content: center;
}
  
.callout.callout-flex .callout-content:has(img) {
  padding: 0;
  background-color: transparent;
}

.callout.callout-flex .callout-content:has(img) p {
    flex-basis: fit-content;
}

.callout.callout-flex .callout-content:has(img) {
    --max-height: max(20vh, 300px);
}

.callout.callout-flex .callout-content:has(img) img {
    display: block;
    max-width: 100%;
    height: 100%;
    max-height: var(--max-height);
    width: auto;
    object-fit: scale-down;
}

.callout.callout-flex .callout-content:has(img) > p{
    margin-bottom: 0;
    padding: 10px 0px;
    max-height: var(--max-height);
    overflow: hidden;
}

.callout.callout-flex .callout-content:has(p) > ul {
    display: flex;
    gap: 30px;
}

.callout.callout-flex .callout-content:has(p) > ul > li > p {
  font-weight: var(--text-weight-bold);
  margin-bottom: 0;
}

.youtube-embed-wrapper{
	display: flex;
	justify-content: center;
}

.youtube-embed-wrapper > .youtube-embed{
	aspect-ratio: 16 / 9;
	width: 100%;
	max-width: 70%;
}

/* 버튼 스타일 */
#theme-toggle {
  position: fixed;
  top: 20px;
  right: 20px;
  background-color: var(--color-accent);
  color: #FFFFFF;
  border: none;
  border-radius: 5px;
  padding: 10px 15px;
  cursor: pointer;
  font-size: 1em;
  transition: background-color 0.3s ease;
  z-index: 1000; /* 버튼을 최상위로 */
}

#theme-toggle:hover {
  background-color: hsl(var(--accent-h), var(--accent-s), calc(var(--accent-l) - 10%));
}
		`;
	}
}
