import { load } from 'cheerio';

import type { DataItem } from '@/types';
import cache from '@/utils/cache';
import puppeteer from '@/utils/puppeteer';

const handler = async () => {
    const baseUrl = 'https://c.biancheng.net';
    const targetUrl = `${baseUrl}/sitemap/`;

    // 关键点：在标准配置下，直接调用 puppeteer()
    // 它会自动识别环境变量中的 PUPPETEER_WS_ENDPOINT 并连接到 browserless 容器
    const browser = await puppeteer();
    const page = await browser.newPage();

    try {
        // 设置一个真实的 UA
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // 建议加上 Referer 绕过某些防火墙
        await page.setExtraHTTPHeaders({
            Referer: 'https://c.biancheng.net/',
        });

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
                return {
                    title: $a.text().trim(),
                    link: new URL($a.attr('href') || '', baseUrl).href,
                } as DataItem;
            });

        // 获取全文逻辑（同样利用 browser 实例）
        const items = await Promise.all(
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
                    } catch {
                        return item;
                    } finally {
                        await detailPage.close();
                    }
                })
            )
        );

        return {
            title: 'C语言中文网 - 生产版',
            link: targetUrl,
            item: items,
        };
    } finally {
        await page.close();
        // 生产环境通常不建议在这里 browser.close()，
        // 因为 RSSHub 的封装层会自动处理连接释放。
        // 如果你一定要关，确保不会影响到其他并发请求。
    }
};

export default handler;
