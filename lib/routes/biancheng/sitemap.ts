import path from 'node:path';

import { load } from 'cheerio';
// eslint-disable-next-line n/no-extraneous-import
import puppeteer from 'puppeteer-core';

import type { DataItem } from '@/types';
import cache from '@/utils/cache';

const handler = async () => {
    const baseUrl = 'https://c.biancheng.net';
    const targetUrl = `${baseUrl}/sitemap/`;
    const isProd = !!process.env.PUPPETEER_WS_ENDPOINT;

    let browser;
    if (isProd) {
        // --- 生产环境：连接到远程 Browserless ---
        browser = await puppeteer.connect({
            browserWSEndpoint: process.env.PUPPETEER_WS_ENDPOINT,
        });
    } else {
        // --- 本地环境：自动探测路径 + 隐私保护 ---
        const chromeRelativePath = path.join('node_modules', '.cache', 'puppeteer', 'chrome', 'win64-145.0.7632.46', 'chrome-win64', 'chrome.exe');
        const executablePath = process.env.LOCAL_CHROME_PATH || path.join(process.cwd(), chromeRelativePath);

        browser = await puppeteer.launch({
            executablePath,
            args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
            headless: true,
        });
    }

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // 1. 抓取列表页
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

        // 2. 抓取详情页全文
        const items = await Promise.all(
            list.map((item) =>
                cache.tryGet(item.link as string, async () => {
                    const detailPage = await browser.newPage();
                    try {
                        await detailPage.goto(item.link as string, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        const detailHtml = await detailPage.content();
                        const $d = load(detailHtml);

                        const content = $d('#arc-body');
                        // 清理正文中的广告和脚本
                        content.find('script, style, .pre-next, #ad-arc-top, #ad-arc-bottom').remove();

                        item.description = content.html() || '内容获取失败';
                        return item;
                    } catch (error) {
                        return { ...item, description: `详情页加载失败: ${error}` };
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
            // 生产环境断开连接，本地环境彻底关闭
            isProd ? await browser.disconnect() : await browser.close();
        }
    }
};

export default handler;
