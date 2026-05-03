import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  // head: [
  //   ['link', {
  //     rel: 'stylesheet',
  //     href: 'https://www.cdnfonts.com/css/optimistic'
  //   }]
  // ],
  title: "FoodApp docs",
  description: "A VitePress Site",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Examples', link: '/markdown-examples' }
    ],

    sidebar: [
      {
        text: 'Introduction',
        collapsed: true,
        items: [
          { text: 'Quick Start', link: '/introduction/quick-start' },
          { text: 'Architecture Overview', link: '/introduction/architectureOverview' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vuejs/vitepress' }
    ]
  }
})
