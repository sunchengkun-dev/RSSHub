import path from 'node:path';

import { load } from 'cheerio';

import type { DataItem } from '@/types';
import cache from '@/utils/cache';

const handler = async () => {
    const baseUrl = 'https://c.biancheng.net';
    const targetUrl = `${baseUrl}/sitemap/`;
    const isProd = !!process.env.PUPPETEER_WS_ENDPOINT;

    let puppeteerModule;
    try {
        const name1 = 'puppeteer-core';
        puppeteerModule = await import(name1);
    } catch {
        try {
            const name2 = 'rebrowser-puppeteer-core';
            // @ts-ignore
            puppeteerModule = await import(name2);
        } catch {
            throw new Error('Puppeteer library not found.');
        }
    }
    const p = puppeteerModule.default || puppeteerModule;

    let browser;
    if (isProd) {
        browser = await p.connect({
            browserWSEndpoint: process.env.PUPPETEER_WS_ENDPOINT,
        });
    } else {
        const chromeRelativePath = path.join('node_modules', '.cache', 'puppeteer', 'chrome', 'win64-145.0.7632.46', 'chrome-win64', 'chrome.exe');
        const executablePath = process.env.LOCAL_CHROME_PATH || path.join(process.cwd(), chromeRelativePath);

        browser = await p.launch({
            executablePath,
            args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
            headless: true,
        });
    }

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        const html = await page.content();
        const $ = load(html);

        const list = $('#recent-update li')
            .toArray()
            .slice(0, 10)
            .map((el) => {
                const $a = $(el).find('a');
                return {
                    title: $a.text().trim(),
                    link: new URL($a.attr('href') || '', baseUrl).href,
                } as DataItem;
            });

        const items = await Promise.all(
            list.map((item) =>
                cache.tryGet(item.link as string, async () => {
                    const detailPage = await browser.newPage();
                    try {
                        await detailPage.goto(item.link as string, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        const detailHtml = await detailPage.content();
                        const $d = load(detailHtml);
                        const content = $d('#arc-body');
                        content.find('script, style, .pre-next, #ad-arc-top, #ad-arc-bottom').remove();

                        item.description = content.html() || '内容获取失败';
                        return item;
                    } catch {
                        return { ...item, description: '详情页抓取超时' };
                    } finally {
                        await detailPage.close();
                    }
                })
            )
        );

        return {
            title: 'C语言中文网 - 最近更新',
            link: targetUrl,
            item: items,
        };
    } finally {
        if (browser) {
            await (isProd ? browser.disconnect() : browser.close());
        }
    }
};

export default handler;
