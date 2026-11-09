import { fileURLToPath } from 'node:url'

import { emitManifestPlugin } from '@ds-wizard/plugin-sdk/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { pluginMetadata } from './src/metadata.ts'

export default defineConfig(({ mode }) => {
    const isProd = mode === 'production'

    return {
        plugins: [react()],

        resolve: {
            alias: {
                '@': fileURLToPath(new URL('./src', import.meta.url)),
            },
        },

        preview: {
            cors: true,
        },

        // Ensure the bundle works in a plain browser host (no Node "process")
        define: {
            'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
            'process.env': JSON.stringify({}),
            process: JSON.stringify({ env: {} }),
            // The address of the plugin's own service, if it has one: behind the
            // wizard's gateway in production, run locally in development
            __API_URL__: JSON.stringify(isProd ? `/gateway/plugins/${pluginMetadata.uuid}` : 'http://localhost:8000'),
        },

        build: {
            lib: {
                entry: {
                    plugin: 'src/plugin.ts',
                },
                formats: ['es'],
                fileName: (_, name) => `${name}.js`,
            },

            // Dev: readable + sourcemaps
            // Prod: aggressive minify + hidden sourcemaps
            sourcemap: isProd ? 'hidden' : true,
            minify: isProd ? 'terser' : 'oxc',

            // Only applies when minify === 'terser'
            terserOptions: isProd
                ? {
                      compress: {
                          passes: 2,
                          drop_console: true,
                          drop_debugger: true,
                      },
                      format: {
                          comments: false,
                      },
                      mangle: true,
                  }
                : undefined,

            emptyOutDir: true,

            // Single-file bundle (handy for plugin loaders)
            rolldownOptions: {
                output: {
                    codeSplitting: false,
                },
                plugins: [emitManifestPlugin(pluginMetadata)],
            },
        },
    }
})
