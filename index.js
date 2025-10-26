const { JSDOM } = require("jsdom");
const { readFileSync, writeFileSync, rmSync } = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const asyncExec = promisify(exec);

/**
 * @typedef {'h1'|'h2'|'div'|'header'} OutputElementTag
 */

function htmlTemplate(title, content) {
  return `<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
</head>
<body>
    ${content}
</body>
</html>`;
}

class OutputElement {
  /**
   * @param {HTMLElement} element 
   * @param {OutputElementTag} [tagOverride]
   * @returns {OutputElement}
   */
  static fromElement(element, tagOverride) {
    const tag = tagOverride ?? (element.tagName.toLowerCase() === 'h2' ? 'h3' : element.tagName);
    return new OutputElement(element.innerHTML, tag);
  }

  /**
   * @param {string} content
   * @param {OutputElementTag} tag
   */
  constructor(content, tag) {
    this.content = content;
    this.tag = tag?.toLowerCase() ?? 'div';
  }

  toHtml() {
    return `<${this.tag}>${this.content.trim()}</${this.tag}>`
  }
}

/**
 * @param {HTMLElement} element 
 * @param {OutputElementTag} [tagOverride]
 * @returns {OutputElement}
 */
function out(element, tagOverride) {
  return OutputElement.fromElement(element, tagOverride);
}

async function convertFile(inputPath) {
  const buffer = readFileSync(inputPath);
  const htmlContent = buffer.toString('utf-8');

  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;

  /**
   * @param {string} selector 
   * @returns {Element | null}
   */
  function select(selector) {
    return document.querySelector(selector);
  }
  
  const titleElement = select('.blog--title');
  const authorElement = select('.author .name a');
  const contentElements = document.querySelectorAll('.article--paragraph, .article--header');

  /** @type {Array<OutputElement>} */
  const output = [
    out(titleElement, 'h1'),
    out(authorElement, 'header'),
    out(select('.blog--subtitle'), 'p'),
    ...[...contentElements]
      .filter(element => !element.matches('.paywallNoAccessWrapperOuter *'))
      .map(contentElement => out(contentElement))
  ];

  const authorName = authorElement.textContent.trim();
  const resultContent = output.map(outElement => outElement.toHtml()).join('\n');
  const title = titleElement.textContent.trim();
  const resultHtml = htmlTemplate(title, resultContent);
  const safeTitle = titleElement.textContent.trim().replaceAll(/[/\\?%*:|"<>]/g, '-');
  const htmlResultPath = `/tmp/${safeTitle}.html`;

  writeFileSync(htmlResultPath, resultHtml);
  const epubResultPath = htmlResultPath.replace(/\.html$/, '.epub');
  await asyncExec(`ebook-convert "${htmlResultPath}" "${epubResultPath}" --chapter-mark="none" --authors="${authorName}" --title="${safeTitle}" --chapter "none" --chapter-mark "none" --dont-split-on-page-breaks --no-default-epub-cover`);
  rmSync(htmlResultPath);
  
  /**
   * TODO:
   * - wiele ścieżek można podać
   * - wykrywanie katalogu w plikach podanych
   * - output dir - domyślnie katalog roboczy
   * - podawanie urli
   */
}

async function main() {
  const inputPath = process.argv[2];
  await convertFile(inputPath);
}

main();