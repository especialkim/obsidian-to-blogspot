import { TFile, Vault } from 'obsidian';
import { BloggerFrontmatter } from './types';

export async function updateFrontmatter(file: TFile, vault: Vault, newFrontmatter: BloggerFrontmatter) {
  const content = await vault.read(file);
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/;
  const match = frontmatterRegex.exec(content);

  let updatedContent: string;

  if (match) {
    // 기존 frontmatter가 있는 경우
    // 기존 frontmatter를 파싱
    const existingFrontmatter = parseFrontmatter(match[1]);

    // newFrontmatter를 기존 frontmatter에 병합
    const mergedFrontmatter = { ...existingFrontmatter, ...newFrontmatter };

    // frontmatter 문자열로 변환
    const newFrontmatterString = serializeFrontmatter(mergedFrontmatter);

    updatedContent = content.replace(frontmatterRegex, `---\n${newFrontmatterString}\n---`);
  } else {
    // 기존 frontmatter가 없는 경우
    const newFrontmatterString = serializeFrontmatter(newFrontmatter as unknown as Record<string, string>);
    updatedContent = `---\n${newFrontmatterString}\n---\n\n${content}`;
  }

  await vault.modify(file, updatedContent);
}

/**
 * 기존 frontmatter 문자열을 객체로 변환
 */
function parseFrontmatter(frontmatter: string): Record<string, string> {
  const lines = frontmatter.split('\n');
  const obj: Record<string, string> = {};

  lines.forEach(line => {
    const [key, ...rest] = line.split(':');
    if (key && rest.length > 0) {
      obj[key.trim()] = rest.join(':').trim().replace(/^"(.*)"$/, '$1');
    }
  });

  return obj;
}

const bloggerFrontmatterKeys: (keyof BloggerFrontmatter)[] = [
  'blogAlias', 'blogId', 'blogUrl', 'blogType', 'blogTitle',
  'blogArticleId', 'blogArticleUrl', 'blogLabels', 'blogIsDraft',
  'blogPublished', 'blogUpdated'
];

/**
 * frontmatter 객체를 문자열로 변환
 */
function serializeFrontmatter(frontmatter: Record<string, any>): string {
  return Object.entries(frontmatter)
    .map(([key, value]) => {
      if (bloggerFrontmatterKeys.includes(key as keyof BloggerFrontmatter)) {
        return `${key}: "${value}"`;
      } else {
        return `${key}: ${value}`;
      }
    })
    .join('\n');
}