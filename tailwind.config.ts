import type { Config } from "tailwindcss";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		/* ============================================================
		   TYPOGRAPHY SCALE – 1.25 ratio
		   12 / 15 / 18 / 24 / 30 / 37 / 46
		   ============================================================ */
		fontSize: {
			'xs': ['0.75rem', { lineHeight: '1.4' }],       // 12px – Metadata
			'sm': ['0.9375rem', { lineHeight: '1.5' }],     // 15px – Body
			'base': ['0.9375rem', { lineHeight: '1.5' }],   // 15px – Body alias
			'lg': ['1.125rem', { lineHeight: '1.4' }],      // 18px – Card title
			'xl': ['1.5rem', { lineHeight: '1.25' }],       // 24px – Section title
			'2xl': ['1.875rem', { lineHeight: '1.2' }],     // 30px – Page title
			'3xl': ['2.3125rem', { lineHeight: '1.2' }],    // 37px – Display
			'4xl': ['2.875rem', { lineHeight: '1.1' }],     // 46px – Hero
		},
		extend: {
			/* ============================================================
			   SPACING – 4px grid
			   4, 8, 12, 16, 24, 32, 48, 64
			   ============================================================ */
			spacing: {
				'1': '0.25rem',   // 4px
				'2': '0.5rem',    // 8px
				'3': '0.75rem',   // 12px
				'4': '1rem',      // 16px
				'6': '1.5rem',    // 24px
				'8': '2rem',      // 32px
				'12': '3rem',     // 48px
				'16': '4rem',     // 64px
				'18': '4.5rem',
				'88': '22rem',
				'128': '32rem',
			},
			boxShadow: {
				'sm': '0 1px 2px 0 rgb(0 0 0 / 0.05)',
				'md': '0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06)',
				'lg': '0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.06)',
				'xl': '0 20px 25px -5px rgb(0 0 0 / 0.08), 0 8px 10px -6px rgb(0 0 0 / 0.06)',
				'card': '0 2px 8px -2px rgb(0 0 0 / 0.06)',
				'card-hover': '0 8px 16px -4px rgb(0 0 0 / 0.1)',
			},
			transitionTimingFunction: {
				'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
			},
			backgroundImage: {
				'gradient-sidebar': 'var(--gradient-sidebar)',
			},
			colors: {
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				/* Full brand scale tokens */
				brand: {
					purple: {
						50: 'hsl(var(--brand-purple-50))',
						100: 'hsl(var(--brand-purple-100))',
						200: 'hsl(var(--brand-purple-200))',
						300: 'hsl(var(--brand-purple-300))',
						400: 'hsl(var(--brand-purple-400))',
						500: 'hsl(var(--brand-purple-500))',
						DEFAULT: 'hsl(var(--brand-purple-600))',
						600: 'hsl(var(--brand-purple-600))',
						700: 'hsl(var(--brand-purple-700))',
						800: 'hsl(var(--brand-purple-800))',
						900: 'hsl(var(--brand-purple-900))',
					},
					acai: {
						50: 'hsl(var(--brand-acai-50))',
						100: 'hsl(var(--brand-acai-100))',
						200: 'hsl(var(--brand-acai-200))',
						300: 'hsl(var(--brand-acai-300))',
						400: 'hsl(var(--brand-acai-400))',
						500: 'hsl(var(--brand-acai-500))',
						DEFAULT: 'hsl(var(--brand-acai-700))',
						600: 'hsl(var(--brand-acai-600))',
						700: 'hsl(var(--brand-acai-700))',
						800: 'hsl(var(--brand-acai-800))',
						900: 'hsl(var(--brand-acai-900))',
					},
					'light-purple': {
						50: 'hsl(var(--brand-light-purple-50))',
						100: 'hsl(var(--brand-light-purple-100))',
						200: 'hsl(var(--brand-light-purple-200))',
						300: 'hsl(var(--brand-light-purple-300))',
						400: 'hsl(var(--brand-light-purple-400))',
						DEFAULT: 'hsl(var(--brand-light-purple-300))',
						500: 'hsl(var(--brand-light-purple-500))',
						600: 'hsl(var(--brand-light-purple-600))',
						700: 'hsl(var(--brand-light-purple-700))',
						800: 'hsl(var(--brand-light-purple-800))',
						900: 'hsl(var(--brand-light-purple-900))',
					},
					fuchsia: {
						50: 'hsl(var(--brand-fuchsia-50))',
						100: 'hsl(var(--brand-fuchsia-100))',
						200: 'hsl(var(--brand-fuchsia-200))',
						300: 'hsl(var(--brand-fuchsia-300))',
						400: 'hsl(var(--brand-fuchsia-400))',
						500: 'hsl(var(--brand-fuchsia-500))',
						DEFAULT: 'hsl(var(--brand-fuchsia-600))',
						600: 'hsl(var(--brand-fuchsia-600))',
						700: 'hsl(var(--brand-fuchsia-700))',
						800: 'hsl(var(--brand-fuchsia-800))',
						900: 'hsl(var(--brand-fuchsia-900))',
					},
					macaron: {
						50: 'hsl(var(--brand-macaron-50))',
						100: 'hsl(var(--brand-macaron-100))',
						200: 'hsl(var(--brand-macaron-200))',
						300: 'hsl(var(--brand-macaron-300))',
						400: 'hsl(var(--brand-macaron-400))',
						DEFAULT: 'hsl(var(--brand-macaron-500))',
						500: 'hsl(var(--brand-macaron-500))',
						600: 'hsl(var(--brand-macaron-600))',
						700: 'hsl(var(--brand-macaron-700))',
						800: 'hsl(var(--brand-macaron-800))',
						900: 'hsl(var(--brand-macaron-900))',
					},
					aqua: {
						50: 'hsl(var(--brand-aqua-50))',
						100: 'hsl(var(--brand-aqua-100))',
						200: 'hsl(var(--brand-aqua-200))',
						300: 'hsl(var(--brand-aqua-300))',
						400: 'hsl(var(--brand-aqua-400))',
						DEFAULT: 'hsl(var(--brand-aqua-500))',
						500: 'hsl(var(--brand-aqua-500))',
						600: 'hsl(var(--brand-aqua-600))',
						700: 'hsl(var(--brand-aqua-700))',
						800: 'hsl(var(--brand-aqua-800))',
						900: 'hsl(var(--brand-aqua-900))',
					},
					/* Legacy flat aliases */
					cyan: 'hsl(var(--brand-cyan))',
					'light-cyan': 'hsl(var(--brand-light-cyan))',
				},
				/* Semantic compliance state colors */
				state: {
					compliant: 'hsl(var(--state-compliant))',
					review: 'hsl(var(--state-review))',
					risk: 'hsl(var(--state-risk))',
					info: 'hsl(var(--state-info))',
					draft: 'hsl(var(--state-draft))',
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'accordion-down': {
					from: { height: '0' },
					to: { height: 'var(--radix-accordion-content-height)' }
				},
				'accordion-up': {
					from: { height: 'var(--radix-accordion-content-height)' },
					to: { height: '0' }
				},
				'fade-in': {
					'0%': { opacity: '0', transform: 'translateY(10px)' },
					'100%': { opacity: '1', transform: 'translateY(0)' }
				},
				'fade-out': {
					'0%': { opacity: '1', transform: 'translateY(0)' },
					'100%': { opacity: '0', transform: 'translateY(10px)' }
				},
				'slide-in-right': {
					'0%': { transform: 'translateX(100%)' },
					'100%': { transform: 'translateX(0)' }
				},
				'slide-out-right': {
					'0%': { transform: 'translateX(0)' },
					'100%': { transform: 'translateX(100%)' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'fade-in': 'fade-in 0.2s ease-out',
				'fade-out': 'fade-out 0.2s ease-out',
				'slide-in-right': 'slide-in-right 0.3s ease-out',
				'slide-out-right': 'slide-out-right 0.3s ease-out'
			}
		}
	},
	plugins: [require("tailwindcss-animate")],
} satisfies Config;
