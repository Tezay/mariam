/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
            },
            colors: {
                // Couleurs système (Shadcn)
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                // Couleurs sémantiques MARIAM
                mariam: {
                    blue: '#000091',      // Bleu France
                    red: '#E1000F',       // Rouge Marianne
                    white: '#FFFFFF',
                    gray: {
                        50: '#f6f6f6',
                        100: '#eeeeee',
                        200: '#dddddd',
                        500: '#666666',
                        700: '#3a3a3a',
                        900: '#161616',
                    }
                }
            },
            borderRadius: {
                lg: "var(--radius)",
                md: "calc(var(--radius) - 2px)",
                sm: "calc(var(--radius) - 4px)",
            },
            // Breakpoints pour TV
            screens: {
                'tv': '1920px',
                '4k': '2560px',
            },
            // Tailles typographiques pour TV
            fontSize: {
                'tv-sm': ['1.25rem', { lineHeight: '1.5' }],
                'tv-base': ['1.75rem', { lineHeight: '1.5' }],
                'tv-lg': ['2.5rem', { lineHeight: '1.3' }],
                'tv-xl': ['4rem', { lineHeight: '1.2' }],
            },
        },
    },
    plugins: [require("tailwindcss-animate")],
}
