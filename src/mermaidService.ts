import { MarkdownPreprocessing } from './markdownPreprocessing';
import mermaid from 'mermaid';

export class MermaidService {
    constructor(private markdownPreprocessing: MarkdownPreprocessing) {}

    async renderToSvg(code: string, alt: string): Promise<string> {
        try {
            // Mermaid 초기화 및 CSS 설정
            mermaid.initialize({
                startOnLoad: false,
                theme: 'dark',
                // 전체적인 설정
                fontSize: 16,
                fontFamily: 'Arial',
                // 플로우차트 특정 설정
                flowchart: {
                    nodeSpacing: 50,
                    rankSpacing: 70,
                    curve: 'basis',
                    htmlLabels: true,
                    padding: 15,
                    useMaxWidth: false
                },
                // ... 다른 다이어그램 유형에 대한 설정 ...
            });

            // Mermaid 코드를 SVG로 변환
            const { svg } = await mermaid.render('mermaid-diagram', code);

            // SVG를 임시 파일로 저장
            const tempFileName = alt ? `${alt}.svg` : `temp-mermaid-${Date.now()}.svg`;
            await this.markdownPreprocessing.getVaultAdapter().write(tempFileName, svg);

            // 임시 파일을 로드하고 URL 얻기
            const imageUrl = await this.markdownPreprocessing.uploadAndReplaceImage(tempFileName);

            // 임시 파일 삭제
            await this.markdownPreprocessing.removeFile(tempFileName);

            // 마크다운 이미지 문법으로 URL 반환 (alt 텍스트 포함)
            return `${imageUrl}`;
        } catch (error) {
            console.error('Error rendering mermaid diagram:', error);
            return `Error rendering mermaid diagram: ${error.message}`;
        }
    }
}
