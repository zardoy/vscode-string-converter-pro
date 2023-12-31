//@ts-check
const tjs = require('typescript-json-schema')
const { defineConfig } = require('@zardoy/vscode-utils/build/defineConfig.cjs')
const { patchPackageJson } = require('@zardoy/vscode-utils/build/patchPackageJson.cjs')

const generateSchema = tjs.generateSchema
tjs.generateSchema = (program, fullTypeName, args) => {
    return generateSchema(program, fullTypeName, {
        ...args,
        ignoreErrors: true,
    })
}

patchPackageJson({})

module.exports = defineConfig({
    extendPropsGenerators: [
        ({ generatedManifest }) => {
            //@ts-ignore
            const config = generatedManifest.contributes.configuration['properties']
            for (const key in config) {
                config[key]['scope'] = 'language-overridable'
            }
            return {}
        },
    ],
    consoleStatements: false,
    target: {
        desktop: true,
        web: true,
    },
})
