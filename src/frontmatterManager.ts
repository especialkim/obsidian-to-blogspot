import { TFile, Vault } from 'obsidian';
import { BloggerFrontmatter } from './types';

export async function updateFrontmatter(file: TFile, vault: Vault, newFrontmatter: BloggerFrontmatter) {
  const content = await vault.read(file);
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---/;
  const match = frontmatterRegex.exec(content);

  let updatedContent: string;

  if (match) {
    // 기존 frontmatter가 있는 경우
    const newFrontmatterString = Object.entries(newFrontmatter)
      .map(([key, value]) => `${key}: "${value}"`)
      .join('\n');
    updatedContent = content.replace(frontmatterRegex, `---\n${newFrontmatterString}\n---`);
  } else {
    // 기존 frontmatter가 없는 경우
    const newFrontmatterString = Object.entries(newFrontmatter)
      .map(([key, value]) => `${key}: "${value}"`)
      .join('\n');
    updatedContent = `---\n${newFrontmatterString}\n---\n\n${content}`;
  }

  await vault.modify(file, updatedContent);
}