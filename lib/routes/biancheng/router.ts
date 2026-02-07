import type { Route } from '@/types';

export const route: Route = {
    path: '/sitemap/:limit?', // 与 sitemap.ts 保持一致
    categories: ['programming'], // 统一分类
    example: '/biancheng/sitemap/15',
    parameters: {
        limit: '获取的文章数量，默认为10',
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: true, // 与 sitemap.ts 保持一致
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
    handler: async (ctx) => {
        const { default: handler } = await import('./sitemap');
        return await handler(ctx); // 传递 ctx 参数
    },
    description: '获取C语言中文网的最新更新内容，支持自定义获取数量',
    url: 'https://c.biancheng.net/sitemap/',
};
