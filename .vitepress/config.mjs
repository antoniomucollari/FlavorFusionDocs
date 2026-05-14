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
          { text: 'Architecture Overview', link: '/introduction/architectureOverview' },
          {
            text: 'Available Restaurants', link: '/technicalDocs/availableRestaurantDocumentation.md',
            items: [
              { text: 'Caching Restaurants', link: '/technicalDocs/RestaurantCaching/availableRestaurantDocumentation.md' }
            ]
          },

          { text: 'Gemini overview', link: '/technicalDocs/gemini3flash.md' }
        ]
      },
      {
        text: 'Cloud Security',
        collapsed: true,
        items: [
          { text: 'Quick Start', link: '/cloudSecurity/main.md' },
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vuejs/vitepress' }
    ]
  }
})
