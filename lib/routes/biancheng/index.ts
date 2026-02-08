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

// 主处理函数
async function handler(ctx: Context) {
    const currentUrl = `${ROOT_URL}/sitemap/`;
    const limit = ctx.req.param('limit') ? Number.parseInt(ctx.req.param('limit')) : 10;

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
                // 修复 unicorn/no-array-callback-reference 警告
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
                        return item;
                    } catch (error) {
                        // 修复 no-console 错误，使用 logger 替代 console
                        logger.error(`Failed to fetch ${item.link}:`, error);
                        return item;
                    }
                })
            )
        );

        return {
            title: 'C语言中文网 - 最近更新',
            link: currentUrl,
            item: items as DataItem[],
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to fetch sitemap: ${errorMessage}`);
    }
}

// 导出路由配置 - 完全符合 RSSHub 官方规范的格式
export const route: Route = {
    path: '/sitemap/:limit?',
    name: '最近更新',
    url: 'c.biancheng.net',
    maintainers: ['sunchnegkun-dev'],
    handler,
    example: '/biancheng/sitemap/15',
    parameters: {
        limit: {
            description: '获取的文章数量，默认为10',
            default: '10',
        },
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
