import { load } from 'cheerio';

import type { DataItem } from '@/types';
import cache from '@/utils/cache';
import puppeteer from '@/utils/puppeteer';

const handler = async () => {
    const baseUrl = 'https://c.biancheng.net';
    const targetUrl = `${baseUrl}/sitemap/`;

    // 1. 使用 RSSHub 封装的 puppeteer，它在生产环境下会自动找到 Chromium 路径
    // 同时保留你测试成功的关键参数
    const browser = await puppeteer({
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
    });

    const page = await browser.newPage();

    try {
        // 2. 模拟真实浏览器特征
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // 3. 访问列表页
        await page.goto(targetUrl, {
            waitUntil: 'networkidle2',
            timeout: 60000,
        });

        const html = await page.content();
        const $ = load(html);

        const list = $('#recent-update li')
            .toArray()
            .slice(0, 10)
            .map((el) => {
                const $li = $(el);
                const $a = $li.find('a');
                const link = new URL($a.attr('href') || '', baseUrl).href;
                return {
                    title: $a.text().trim(),
                    link,
                } as DataItem;
            });

        // 4. 递归抓取全文（带缓存控制）
        const items = (await Promise.all(
            list.map((item) =>
                cache.tryGet(item.link as string, async () => {
                    const detailPage = await browser.newPage();
                    try {
                        await detailPage.goto(item.link as string, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        const detailHtml = await detailPage.content();
                        const $detail = load(detailHtml);

                        const content = $detail('#arc-body');
                        content.find('script, .pre-next, #ad-arc-top, #ad-arc-bottom').remove();

                        item.description = content.html() || '内容获取失败';
                        return item;
                    } catch (error) {
                        item.description = `详情页抓取失败: ${error}`;
                        return item;
                    } finally {
                        await detailPage.close();
                    }
                })
            )
        )) as DataItem[];

        return {
            title: 'C语言中文网 - 最近更新',
            link: targetUrl,
            item: items,
        };
    } finally {
        // 5. 务必关闭页面，防止内存泄漏
        await page.close();
        // 注意：在 RSSHub 插件中，通常由系统管理 browser 实例，
        // 但如果你是手动启动的，建议在 handler 结束前关闭。
        await browser.close();
    }
};

export default handler;
