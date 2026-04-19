#!/usr/bin/env node
import { JSDOM } from "jsdom";
import { readFileSync, writeFileSync, rmSync, statSync, readdirSync } from 'fs';
import Path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { argv as _argv } from 'process';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

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

/**
 * @typedef {Object} ConverterOptions
 * @property {string} outputDir
 * @property {boolean} preserveHtml
 */

class Converter {
  /**
   * @param {ConverterOptions} options
   */
  constructor(options) {
    this.outputDir = options.outputDir ?? '/tmp';
    this.preserveHtml = options.preserveHtml ?? false;
  }

  async convert(path) {
    if (statSync(path).isDirectory()) {
      const files = readdirSync(path);
      // FIXME: paralallelism
      // const promises = [];
      for (const filename of files) {
        const filepath = Path.join(path, filename);
        await this.convertFile(filepath);
        // promises.push(this.convertFile(filepath));
      }
      // await Promise.all(promises);
    } else {
      await this.convertFile(path);
    }
  }

  async convertFile(inputPath) {
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

    const titleElement = select('.articleTitle');
    const authorElement = select('.author .name a');
    const contentElements = document.querySelectorAll('.articleBodyBlock, .article--header');

    /** @type {Array<OutputElement>} */
    const output = [
      out(titleElement, 'h1'),
      out(authorElement, 'header'),
      out(select('.blog--subtitle,.article--lead'), 'p'),
      ...[...contentElements]
        .filter(element => !element.matches('.paywallNoAccessWrapperOuter *, .block--content--excerpt'))
        .map(contentElement => out(contentElement))
    ];

    const authorName = authorElement.textContent.trim();
    const resultContent = output.map(outElement => outElement.toHtml()).join('\n');
    const title = titleElement.textContent.trim();
    const resultHtml = htmlTemplate(title, resultContent);
    const safeTitle = titleElement.textContent.trim().replaceAll(/[/\\?%*:|"<>]/g, '-');
    const htmlResultPath = `${this.outputDir}/${safeTitle}.html`;

    // FIXME: HTML file dir another than epub dir if preserveHtml is false
    writeFileSync(htmlResultPath, resultHtml);
    const epubResultPath = htmlResultPath.replace(/\.html$/, '.epub');
    await asyncExec(`ebook-convert "${htmlResultPath}" "${epubResultPath}" --chapter-mark="none" --authors="${authorName}" --title="${safeTitle}" --chapter "none" --chapter-mark "none" --dont-split-on-page-breaks --no-default-epub-cover`);
    if (!this.preserveHtml) {
      rmSync(htmlResultPath);
    }
  }
}

async function main() {
  const argv = yargs(hideBin(_argv))
    .demandCommand(1)
    .option('output-dir', {
      type: 'string',
      description: 'Directory where .epub files will be saved',
      default: '/tmp',
    })
    .option('preserve-html', {
      type: 'boolean',
      description: 'If true, intermediary HTML files will not be deleted after successful .epub creation',
      default: false,
    })
    .usage('Usage: $0 <input_path> [options]')
    .parse()
  const inputPath = argv._[0];
  // console.log(
  //   inputPath,
  //   argv.outputDir,
  //   argv.preserveHtml,
  // )
  const converter = new Converter({
    outputDir: argv.outputDir,
    preserveHtml: argv.preserveHtml,
  });
  await converter.convert(inputPath);
}

main();