import type { CheerioAPI } from 'cheerio';
import { load } from 'cheerio';
import type { Context } from 'hono';

import type { DataItem, Route } from '@/types';
import cache from '@/utils/cache';
import got from '@/utils/got';
import logger from '@/utils/logger';

// 提取常量
const ROOT_URL = 'https://c.biancheng.net';
const SELECTORS = {
    RECENT_UPDATE_LIST: '#recent-update li',
    CONTENT: '#arc-body',
    REMOVE_ELEMENTS: 'script, style, .pre-next, #ad-arc-top, #ad-arc-bottom',
};

// 提取工具函数
const cleanContent = ($: CheerioAPI, selector: string): string | undefined => {
    const $content = $(selector);
    $content.find(SELECTORS.REMOVE_ELEMENTS).remove();
    return $content.html() || undefined;
};

const validateUrl = (href: string | undefined, baseUrl: string): string | null => {
    if (!href) {
        return null;
    }
    try {
        return new URL(href, baseUrl).href;
    } catch {
        return null;
    }
};

// 主处理函数 - 简化版本
async function handler(ctx: Context) {
    const currentUrl = `${ROOT_URL}/sitemap/`;

    // 简化参数处理，避免folo源解析问题
    let limit = 10; // 默认值
    try {
        const limitParam = ctx.req.param('limit');
        if (limitParam) {
            const parsedLimit = Number.parseInt(limitParam, 10);
            if (!Number.isNaN(parsedLimit) && parsedLimit > 0) {
                limit = Math.min(parsedLimit, 50); // 限制最大数量
            }
        }
    } catch {
        // 参数解析失败时使用默认值
        logger.warn('Failed to parse limit parameter, using default value 10');
    }

    try {
        const response = await got({
            method: 'get',
            url: currentUrl,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });

        const $ = load(response.data);

        const list = $(SELECTORS.RECENT_UPDATE_LIST)
            .toArray()
            .slice(0, limit)
            .map((el) => {
                const $element = $(el);
                const $a = $element.find('a');
                const link = validateUrl($a.attr('href'), ROOT_URL);

                if (!link) {
                    return null;
                }

                return {
                    title: $a.text().trim(),
                    link,
                } as DataItem;
            })
            .filter(Boolean) as DataItem[];

        const items = await Promise.all(
            list.map((item) =>
                cache.tryGet(item.link!, async () => {
                    try {
                        const detailResponse = await got({
                            method: 'get',
                            url: item.link,
                            headers: {
                                Referer: currentUrl,
                            },
                        });

                        const $d = load(detailResponse.data);
                        item.description = cleanContent($d, SELECTORS.CONTENT);
                        item.pubDate = new Date().toUTCString(); // 添加发布时间
                        return item;
                    } catch (error) {
                        logger.error(`Failed to fetch ${item.link}:`, error);
                        return item;
                    }
                })
            )
        );

        return {
            title: 'C语言中文网 - 最近更新',
            link: currentUrl,
            description: '获取C语言中文网的最新更新内容',
            item: items as DataItem[],
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to fetch sitemap: ${errorMessage}`);
        throw new Error(`Failed to fetch sitemap: ${errorMessage}`);
    }
}

// 导出两个版本的路由以提高兼容性
export const route: Route = {
    path: '/sitemap/:limit?', // 保持可选参数以兼容现有调用
    name: '最近更新',
    url: 'c.biancheng.net',
    maintainers: ['sunchnegkun-dev'],
    handler,
    example: '/biancheng/sitemap/15',
    parameters: {
        limit: '获取的文章数量，默认为10',
    },
    categories: ['programming'],
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['c.biancheng.net/sitemap/'],
            target: '/sitemap/:limit?',
        },
    ],
    description: '获取C语言中文网的最新更新内容，支持自定义获取数量',
};

// 同时导出一个无参数版本以提高folo源兼容性
export const routeWithoutParam: Route = {
    path: '/sitemap', // 不带参数的版本
    name: '最近更新(默认)',
    url: 'c.biancheng.net',
    maintainers: ['sunchnegkun-dev'],
    handler: async (ctx) =>
        // 设置默认limit为10
        await handler(ctx),
    example: '/biancheng/sitemap',
    parameters: {},
    categories: ['programming'],
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: true,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['c.biancheng.net/sitemap/'],
            target: '/sitemap',
        },
    ],
    description: '获取C语言中文网的最新更新内容(默认10条)',
};
