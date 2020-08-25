import { readFileSync, writeFileSync } from 'fs'
import * as yaml from 'yaml'
import upgrade from '.'
import generateTypes from '../types/generateTypes'
import visit from './visit'

test.skip('generate types', () => {
	const schemaName = '1.0.0'
	const mini = generateTypes(JSON.parse(readFileSync(`sarif-${schemaName}.json`, 'utf8')))
	writeFileSync(`${schemaName}.yaml`, mini)
})

test.skip('visit3 traversal', () => {
	const path = '/path/to/log.sarif'
	const log = JSON.parse(readFileSync(path, 'utf8'))
	const types = yaml.parse(readFileSync('2.0.0.yaml', 'utf8'))
	visit(log, types)
})

const logNames = [
	'ArtifactsWithRoles',
	'ComprehensiveFileProperties',
	'ComprehensiveToolProperties.01-24',
	'ComprehensiveToolProperties',
	'ExercisesSchemaRtm5Changes',
	'LocationWithId',
	'MultiformatMessageStrings',
	'NestedFiles', // input had bad trailing comma, input line 147 (ArtifactLocation.uri) modified
	'NestedInnerExceptionsInNotifications',
	'OneRunWithBasicInvocation',
	'OneRunWithInvocationExitCode',
	'OneRunWithRedactionToken',
	'RegressionTests',
	'RuleIdCollisions',
	'RunResources', // Expected is missing markdownMessageMimeType.
	'ThreadFlowLocationWithKind',
	'ToolWithLanguage',
	'V1', // Expect modified per https://github.com/microsoft/sarif-sdk/issues/2043.
	'WithExternalPropertyFiles.01-24',
	'WithSuppressions',
]

test.skip('upgrade and write', () => {
	const logName = 'NestedFiles'
	const log = JSON.parse(readFileSync(`/test/input/${logName}.sarif`, 'utf8').replace(/^\uFEFF/, '')) // Trim BOM for `WithExternalPropertyFiles.01-24`.
	expect(upgrade(log)).toBe(true)
	writeFileSync(`../outputActual/${logName}.sarif`, JSON.stringify(log, null, '  '))
})

for (const logName of logNames) {
	testLog(logName)
}

function testLog(logName: string) {
	test(`upgrade ${logName}`, () => {
		const input = JSON.parse(readFileSync(`test/input/${logName}.sarif`, 'utf8').replace(/^\uFEFF/, '')) // Trim BOM for `WithExternalPropertyFiles.01-24`.
		const expected = JSON.parse(readFileSync(`test/expected/${logName}.sarif`, 'utf8').replace(/^\uFEFF/, '')) // Trim BOM for `WithExternalPropertyFiles.01-24`.
		const schema210rtm5 = yaml.parse(readFileSync('types/2.1.0-rtm.5.yaml', 'utf8'))
		visit(expected, schema210rtm5, {
			artifact: node => node.roles?.sort()
		})
		expect(upgrade(input)).toBe(true)
		const actual = JSON.parse(JSON.stringify(input)) // Remove undefined fields.
		visit(actual, schema210rtm5, { // Strip default values
			run: node => {
				if (node.language === 'en-US') delete node.language
				delete node.markdownMessageMimeType // Per release history v2.1.0-beta.2. Move to applyTc35?
			},
			result: node => {
				if (node.kind === 'fail') delete node.kind
			},
			threadFlowLocation: node => {
				if (node.importance === 'important') delete node.importance
			},
		})
		expect(actual).toEqual(expected)
	})	
}
