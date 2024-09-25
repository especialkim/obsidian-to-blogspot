import { MarkdownPreprocessing } from './markdownPreprocessing';
import { exec } from 'child_process';
import { promisify } from 'util';
import { FileSystemAdapter } from 'obsidian';
import * as path from 'path';

const execAsync = promisify(exec);

export class D2Service {
    constructor(private markdownPreprocessing: MarkdownPreprocessing) {}

    async renderToImageURL(code: string, alt: string): Promise<string> {
        
        try {
            // 임시 D2 파일 생성
            const tempD2FileName = `${alt}.d2`;
            await this.markdownPreprocessing.getVaultAdapter().write(tempD2FileName, code);

            // FileSystemAdapter의 getFullPath 메서드를 사용하여 전체 경로 가져오기
            const adapter = this.markdownPreprocessing.getVaultAdapter() as FileSystemAdapter;
            const tempD2FilePath = adapter.getFullPath(tempD2FileName);

            // 전체 폴더 경로 추출
            const folderPath = path.dirname(tempD2FilePath) + '/';

            // GIF 파일 이름 설정
            const tempSvgFileName = `${alt}.svg`;
            const tempSvgFilePath = path.join(folderPath, tempSvgFileName);

            // d2 실행 파일의 전체 경로를 지정합니다
            const d2Path = '/opt/homebrew/bin/d2';  // 실제 d2 실행 파일 경로로 변경하세요

            const { stdout, stderr } = await execAsync(`"${d2Path}" "${tempD2FilePath}" "${tempSvgFilePath}"`);
            if (stderr) console.error('D2 CLI execution error:', stderr);

            // SVG를 업로드하고 URL 얻기
            const imageUrl = await this.markdownPreprocessing.uploadAndReplaceImage(tempSvgFileName);

            // 임시 파일들 삭제
            // await this.markdownPreprocessing.removeFile(tempD2FileName);
            // await this.markdownPreprocessing.removeFile(tempSvgFileName);

            // 마크다운 이미지 문법으로 URL 반환
            return imageUrl;
        } catch (error) {
            console.error('Error rendering D2 diagram:', error);
            return `Error rendering D2 diagram: ${error.message}`;
        }
    }
}