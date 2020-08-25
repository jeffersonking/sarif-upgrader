type Types = Record<string, Record<string, string>>

type Json = Record<string, any>
type NodeHandler = (item: Json, typeName: string, pointer: string) => void
type NodeHandlerMap = Record<string, (item: Json, pointer: string) => void>

export default function(
	node: Json,
	types: Types,
	onNode?: NodeHandler | NodeHandlerMap
) {
	function visit(node: Json, typeName: string, pointer: string = '', depth = 0) {
		// console.log('  '.repeat(depth), typeName)
		const members = types[typeName]
		if (members !== null) { // Skip dead-end types like `message`
			if (!members) throw new Error(`type derailment @ ${pointer} - ${typeName}`)
			for (const key in node) {
				const member = node[key]
				const memberTypeName = members[key]
				if (typeof member !== 'object') continue
				if (memberTypeName === null) continue // Dead end type like `logicalLocation`
				if (!memberTypeName) continue // Example 2.0.0 file.roles is a enum[], don't traverse
				// if (!memberType) throw new Error(`member type derailment @ ${pointer}/${typeName}:${key}`)

				if (memberTypeName.endsWith('[]')) {
					const itemType = memberTypeName.replace('[]', '')
					member.forEach((item, i) => {
						// console.log('  '.repeat(depth + 1), `${i}`)
						visit(item, itemType, `${pointer}/${key}/${i}`, depth + 2)
					})
				} else if (memberTypeName.endsWith('{}')) {
					const itemType = memberTypeName.replace('{}', '')
					for (const [itemKey, item] of Object.entries(member)) {
						// console.log('  '.repeat(depth + 1), `-`)
						visit(item, itemType, `${pointer}/${key}/${itemKey}`, depth + 2) // 2 or 1?
					}
				} else {
					visit(member, memberTypeName, `${pointer}/${key}`, depth + 1)
				}
			}
		}
		if (typeof onNode === 'function') {
			onNode?.(node, typeName, pointer)
		}
		if (typeof onNode === 'object') {
			onNode[typeName]?.(node, pointer)
		}
	}

	visit(node, 'log')
}
