import { JSONSchema4 } from "json-schema"

// Translates JSONSchema to YAML.
export default function(schema: JSONSchema4) {
	let result = ''
	const log = msg => result = `${result}\n${msg}`

	function generateProperties(properties: Record<string, any>, typeName?: string) {
		for (const propName in properties) {
			if (propName === 'properties') continue // Unsure of 'properties'.
			const meta = properties[propName]
			if (meta.type === 'boolean') continue
			if (meta.type === 'integer') continue
			if (meta.type === 'number') continue
			if (meta.type === 'string') continue
			if (meta.enum) continue
			if (meta.type === 'array') {
				if (meta.items['enum']) continue
				if (meta.items['type']) continue // Skip instrinsic types
				log(`  ${propName}: ${meta.items['$ref']?.replace('#/definitions/', '') ?? '?'}[]`)
			} else if (meta.type === 'object') {
				if (!meta.additionalProperties) continue // Example: 2.0.0 threadFlowLocation.state
				if (meta.additionalProperties === true) continue // Example: 2.0.0 invocation.environmentVariables
				if (meta.additionalProperties['type']) continue // Skip instrinsic types
				if (propName === 'environmentVariables') console.log(meta)
				log(`  ${propName}: ${meta.additionalProperties['$ref']?.replace('#/definitions/', '') ?? '?'}{}`)
			} else {
				log(`  ${propName}: ${meta.$ref?.replace('#/definitions/', '') ?? meta.type ?? '?'}`)
			}
		}
	}

	log('---')
	log('log:')
	generateProperties(schema.properties)
	for (const typeName in schema.definitions) {
		log(`${typeName}:`)
		generateProperties(schema.definitions[typeName].properties, typeName)
	}
	return result
}
