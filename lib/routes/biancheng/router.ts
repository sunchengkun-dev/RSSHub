import type { Route } from '@/types';

// 删除未使用的 Context 导入，修复 @typescript-eslint/no-unused-vars 错误
// import type { Context } from 'hono';
// 导入处理函数
import { handler as sitemapHandler } from './sitemap';

export const route: Route = {
    path: '/sitemap/:limit?',
    categories: ['programming'],
    example: '/biancheng/sitemap/15',
    parameters: {
        limit: {
            description: '获取的文章数量，默认为10',
            default: '10',
        },
    },
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
    name: '最近更新',
    maintainers: ['sunchnegkun-dev'],
    handler: sitemapHandler,
    description: '获取C语言中文网的最新更新内容，支持自定义获取数量',
    url: 'https://c.biancheng.net/sitemap/',
};
