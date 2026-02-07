import path from 'node:path';

import { load } from 'cheerio';

import type { DataItem } from '@/types';
import cache from '@/utils/cache';

const handler = async () => {
    const baseUrl = 'https://c.biancheng.net';
    const targetUrl = `${baseUrl}/sitemap/`;

    // 判定是否为生产环境（Zeabur 等云端环境通常会设置这些变量）
    const isProd = process.env.NODE_ENV === 'production' || !!process.env.PUPPETEER_WS_ENDPOINT;

    let browser;

    if (isProd) {
        // --- 1. 生产环境逻辑 ---
        // 使用字符串变量和动态 import 绕过静态 Lint 检查及本地版本自检
        const officialPath = '@/utils/puppeteer';
        const mod = await import(officialPath);
        const officialPuppeteer = mod.default || mod;

        // 生产环境直接调用官方封装，它会自动连接到指定的 Browserless 服务
        browser = await officialPuppeteer();
    } else {
        // --- 2. 本地环境逻辑 ---
        // 彻底绕过官方工具类，直接从 puppeteer-core 启动
        const corePkg = 'puppeteer-core';
        const p = await import(corePkg);
        const pCore = p.default || p;

        // 自动探测本地 Chrome 路径（保持隐私，不泄露个人用户名）
        const chromePath = path.join(
            process.cwd(),
            'node_modules',
            '.cache',
            'puppeteer',
            'chrome',
            'win64-145.0.7632.46', // 请确保此版本号与你本地 node_modules 下的一致
            'chrome-win64',
            'chrome.exe'
        );

        browser = await pCore.launch({
            executablePath: chromePath,
            args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
            headless: true,
        });
    }

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');

        // 抓取列表页
        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        const html = await page.content();
        const $ = load(html);

        const list = $('#recent-update li')
            .toArray()
            .slice(0, 5) // 云端测试建议先取 5 条，稳定后再增加
            .map((el) => {
                const $a = $(el).find('a');
                return {
                    title: $a.text().trim(),
                    link: new URL($a.attr('href') || '', baseUrl).href,
                } as DataItem;
            });

        // 抓取详情页全文
        const items = await Promise.all(
            list.map((item) =>
                cache.tryGet(item.link as string, async () => {
                    const detailPage = await browser.newPage();
                    try {
                        await detailPage.goto(item.link as string, { waitUntil: 'domcontentloaded', timeout: 30000 });
                        const detailHtml = await detailPage.content();
                        const $d = load(detailHtml);

                        const content = $d('#arc-body');
                        // 移除干扰元素
                        content.find('script, style, .pre-next, #ad-arc-top, #ad-arc-bottom').remove();

                        item.description = content.html() || '正文内容获取失败';
                        return item;
                    } catch (error) {
                        return { ...item, description: `详情页抓取失败: ${error}` };
                    } finally {
                        await detailPage.close();
                    }
                })
            )
        );

        return {
            title: 'C语言中文网 - 最新更新',
            link: targetUrl,
            item: items,
        };
    } finally {
        if (browser) {
            // 统一使用 close，官方工具类内部会根据环境自动处理 disconnect 或关闭
            await browser.close();
        }
    }
};

export default handler;
