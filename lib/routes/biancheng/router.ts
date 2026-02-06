import type { Route } from '@/types';

export const route: Route = {
    path: '/sitemap',
    categories: ['program-learning'],
    example: '/biancheng/sitemap',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
    },
    radar: [
        {
            source: ['c.biancheng.net/sitemap/'],
            target: '/sitemap',
        },
    ],
    name: '最近更新',
    maintainers: ['sunchnegkun-dev'],
    handler: async () => {
        const { default: handler } = await import('./sitemap');
        return await handler();
    },
};
