'use client'

import { createContext, useContext, useEffect, useSyncExternalStore } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextType {
    theme: Theme
    setTheme: (theme: Theme) => void
    toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)
const systemThemeQuery = '(prefers-color-scheme: dark)'
const themeChangeEvent = 'hr-app:theme-change'

function getTheme(): Theme {
    const savedTheme = window.localStorage.getItem('theme')
    if (savedTheme === 'light' || savedTheme === 'dark') {
        return savedTheme
    }
    return window.matchMedia(systemThemeQuery).matches ? 'dark' : 'light'
}

function getServerTheme(): Theme {
    return 'light'
}

function subscribeToTheme(onChange: () => void) {
    const systemTheme = window.matchMedia(systemThemeQuery)
    const onStorageChange = (event: StorageEvent) => {
        if (event.key === 'theme' || event.key === null) {
            onChange()
        }
    }

    systemTheme.addEventListener('change', onChange)
    window.addEventListener('storage', onStorageChange)
    window.addEventListener(themeChangeEvent, onChange)

    return () => {
        systemTheme.removeEventListener('change', onChange)
        window.removeEventListener('storage', onStorageChange)
        window.removeEventListener(themeChangeEvent, onChange)
    }
}

function setTheme(theme: Theme) {
    window.localStorage.setItem('theme', theme)
    window.dispatchEvent(new Event(themeChangeEvent))
}

export function useTheme() {
    const context = useContext(ThemeContext)
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider')
    }
    return context
}

interface Props {
    children: React.ReactNode
}

export function ThemeProvider({ children }: Props) {
    const theme = useSyncExternalStore(subscribeToTheme, getTheme, getServerTheme)

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme)
    }, [theme])

    const toggleTheme = () => {
        setTheme(getTheme() === 'light' ? 'dark' : 'light')
    }

    return (
        <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}
