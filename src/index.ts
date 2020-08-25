import { readFileSync } from 'fs'
import * as yaml from 'yaml'
import visit from './visit'

// TODO: Load on demand.
const schema100        = yaml.parse(readFileSync('types/1.0.0.yaml', 'utf8'))
const schema200        = yaml.parse(readFileSync('types/2.0.0.yaml', 'utf8'))
const schema200_181010 = yaml.parse(readFileSync('types/2.0.0-csd.2.beta.2018-10-10.yaml', 'utf8'))
const schema200_190124 = yaml.parse(readFileSync('types/2.0.0-csd.2.beta.2019-01-24.yaml', 'utf8'))
const schema200_190220 = yaml.parse(readFileSync('types/2.0.0-csd.2.beta.2019-02-20.yaml', 'utf8'))
const schema210rtm0    = yaml.parse(readFileSync('types/2.1.0-rtm.0.yaml', 'utf8'))
const schema210rtm5    = yaml.parse(readFileSync('types/2.1.0-rtm.5.yaml', 'utf8'))

/**
 * Attempts to upgrade a SARIF log. Limited versions supported.
 * @param log JSON (not string) representation of the SARIF Log.
 * @returns Success of the upgrade.
 */
export default function(log: any): boolean {
	let { version } = log
	if (version === '2.1.0' && log.$schema) {
		version = log.$schema!
			.replace('http://json.schemastore.org/sarif-', '')
			.replace('https://schemastore.azurewebsites.net/schemas/json/sarif-', '')
			.replace(/\.json$/, '')
	}
	// console.log(version)
	switch (version) {
		case '1.0.0':
			apply200(log);
		case '2.0.0': // Is 2.0.0 really before 2.0.0-csd?
			applyCore(log);
		case '2.0.0-csd.2.beta.2018-10-10':
		case '2.0.0-csd.2.beta.2018-10-10.1':
		case '2.0.0-csd.2.beta.2018-10-10.2':
			applyTc30(log);
		case '2.0.0-csd.2.beta.2019-01-09':
			applyTc31(log);
		case '2.0.0-csd.2.beta.2019-01-24':
		case '2.0.0-csd.2.beta.2019-01-24.1':
			applyTc32(log);
		case '2.0.0-csd.2.beta.2019-02-20':
			applyTc33(log);
		case '2.0.0-csd.2.beta.2019-04-03':
			applyTc34(log)
		case '2.1.0-beta.0':
		case '2.1.0-beta.1':
			applyTc35(log)
		case '2.1.0-beta.2':
			applyRtm0(log)
		case '2.1.0-rtm.0':
			applyRtm1(log)
		case '2.1.0-rtm.1':
		case '2.1.0-rtm.2':
		case '2.1.0-rtm.3':
		case '2.1.0-rtm.4':
			applyRtm5(log)
		case '2.1.0-rtm.5':
		case '2.1.0':
			return true // Log is current.
		default:
			return false // Unrecognized version.
	}
}

function apply200(log: any) {
	const logicalLocationKeyToDecoratedNameMap = new Map<string, string>()
	visit(log, schema100, {
		location: node => {
			if (node.decoratedName) {
				const key = node.logicalLocationKey ?? node.fullyQualifiedLogicalName
				logicalLocationKeyToDecoratedNameMap.set(key, node.decoratedName)
			}
		},
	})
	visit(log, schema100, {
		run: node => {
			rename(node, 'rules', 'resources', rules => ({ rules }))
			for (const key in node.logicalLocations) {
				node.logicalLocations[key].decoratedName = logicalLocationKeyToDecoratedNameMap.get(key)
			}
		},
		rule: node => {
			node.shortDescription = node.shortDescription && { text: node.shortDescription }
			node.fullDescription = node.fullDescription && { text: node.fullDescription }
			rename(node, 'messageFormats', 'messageStrings')
		},
		result: node => {
			node.message = node.message && { text: node.message }
			if (node.formattedRuleMessage) { // formatId is required
				node.message = node.message ?? {}
				node.message.id = node.formattedRuleMessage.formatId
				node.message.arguments = node.formattedRuleMessage.arguments
				delete node.formattedRuleMessage
			}

			// Choose the first one?
			node.analysisTarget = node.locations?.find(location => location.analysisTarget)?.analysisTarget?.fileLocation
			node.locations?.forEach(location => delete location.analysisTarget)

			if (node.snippet) { // Choose the first location?
				// Can't guarantee this path exists.
				node.locations[0].physicalLocation.region.snippet = { text: node.snippet }
				delete node.snippet
			}
		},
		location: node => {
			if (node.resultFile) {
				rename(node, 'resultFile', 'physicalLocation')
			} else {
				rename(node, 'analysisTarget', 'physicalLocation')
			}
			delete node.decoratedName
		},
		physicalLocation: node => {
			rename(node, 'uri', 'fileLocation', uri => ({ uri }))
		},
		annotatedCodeLocation: node => {
			node.message = node.message && { text: node.message }
		},
		region: node => {
			if (node.length !== undefined) node.offset ??= 0
			rename(node, 'offset', 'byteOffset')
			rename(node, 'length', 'byteLength')
		},
		file: node => {
			// if node.contents is undef, then the prop entry will still be created.
			node.contents = node.contents && { text: atob(node.contents) }
		},
	})
}

function applyCore(log: any) {
	visit(log, schema200, {
		result: node => {
			// https://github.com/oasis-tcs/sarif-spec/issues/216
			if (node.ruleMessageId !== undefined) {
				node.message = node.message ?? {} // `message` is not mandatory in this version.
				node.message.messageId = node.ruleMessageId // result.ruleMessageId not in 2.0.0, might be in 2.1.0-CSD.1
				delete node.ruleMessageId
			}
		},
		threadFlowLocation: node => {
			rename(node, 'timestamp', 'executionTimeUtc')
			delete node.step
		},
		invocation: node => {
			// https://github.com/oasis-tcs/sarif-spec/issues/222
			node.workingDirectory = node.workingDirectory && { uri: node.workingDirectory } // Structural // 2.0.0: workingDirectory is already an fileLocation
			// https://github.com/oasis-tcs/sarif-spec/issues/242
			rename(node, 'startTime', 'startTimeUtc')
			rename(node, 'endTime', 'endTimeUtc')
		},
		file: node => {
			node.hashes = node.hashes?.reduce((o, { algorithm, value }) => {
				if (algorithm === 'sha256') algorithm = 'sha-256' // TODO: Fix.
				o[algorithm] = value;
				return o;
			}, {}) // Structural
			rename(node, 'lastModifiedTime', 'lastModifiedTimeUtc')
		},
		notification: node => {
			rename(node, 'time', 'timeUtc')
		},
		exception: node => {
			node.message = { text: node.message } // Structural
		},
		versionControlDetails: node => {
			rename(node, 'timestamp', 'asOfTimeUtc')
			rename(node, 'uri', 'repositoryUri')
			rename(node, 'tag', 'revisionTag')
		},
		run: node => {
			// https://github.com/oasis-tcs/sarif-spec/issues/234
			revalues(node.originalUriBaseIds, uri => { uri }) // Structural

			const { logicalId, description, instanceGuid, correlationGuid } = node
			if (logicalId || description || instanceGuid || correlationGuid) {
				const instanceId = logicalId && instanceGuid && `${logicalId}/${instanceGuid}`
				node.id = { // Structural
					instanceId,
					description,
					instanceGuid,
					correlationGuid,
				}
				delete node.logicalId
				delete node.description
				delete node.instanceGuid
				delete node.correlationGuid
			}

			if (node.automationLogicalId) {
				node.aggregateIds = [{ instanceId: `${node.automationLogicalId}/` }] // Structural
				delete node.automationLogicalId
			}
		},
	})
}

function applyTc30(log: any) {
	const logicalLocationKey = new Map<string, number>()
	const fileKeyToIndex = new Map<string, number>()
	const ruleIdToIndex = new Map<string, number>()

	visit(log, schema200_181010, (node: any, typeName: string) => {
		if (typeName === 'run') {
			// https://github.com/oasis-tcs/sarif-spec/issues/262
			delete node.architecture

			// Needs review from Mike.
			if (node.logicalLocations) {
				node.logicalLocations = Object.entries(node.logicalLocations as Record<string, any>).map(([key, location], i) => {
					logicalLocationKey.set(key, i)
					return location
				})
				node.logicalLocations.forEach(location => {
					if (!location.parentKey) return
					location.parentIndex = logicalLocationKey.get(location.parentKey)!
					delete location.parentKey
				})
				if (!node.logicalLocations.length) delete node.logicalLocations // Need to generalize. Affects: ThreadFlowLocationWithKind
			}

			if (node.files) {
				node.files = Object.entries(node.files as Record<string, any>).map(([key, file], i) => {
					fileKeyToIndex.set(key, i) // uri is added before it's modified
					let uriBaseId = undefined
					const match = /#([^#]+)#(.+)/.exec(key)
					let baselessUri = key
					if (match) {
						uriBaseId = match[1]
						baselessUri = match[2]
					}
					let uri = file.fileLocation?.uri ?? baselessUri
					if (uri.startsWith('file://c')) uri = uri.replace('file://c', 'file:///c') // TEMP
					file.fileLocation = {
						uri,
						uriBaseId, // !!! Review corner cases
						index: baselessUri !== key ? i : undefined, // Only some!
					}
					return file
				})
				node.files.forEach(file => {
					if (!file.parentKey) return
					file.parentIndex = fileKeyToIndex.get(file.parentKey)!
					delete file.parentKey
				})
			}
		}
		if (typeName === 'resources' && node.rules) {
			node.rules = Object.entries(node.rules as Record<string, any>).map(([id, rule], i) => {
				ruleIdToIndex.set(id, i)
				rule.id = rule.id ?? id // Or just overwrite?
				return rule
			})
			if (!node.rules.length) delete node.rules // Need to generalize. Affects: ThreadFlowLocationWithKind
		}
		if (typeName === 'ruleConfiguration') {
			if (node.defaultLevel === 'open') node.defaultLevel = 'note'
		}

		if (typeName === 'result') {
			node.message = node.message ?? { text: '[No message provided].' }
		}

		if (typeName === 'run') {
			node.columnKind = node.columnKind ?? 'utf16CodeUnits'
		}
		if (typeName === 'tool') {
			rename(node, 'fileVersion', 'dottedQuadFileVersion')
		}
	})

	// visit(log, schema200_181010, {
	// })

	const files = log.runs?.[0]?.files // Needs to be per-run
	const logicalLocations = log.runs?.[0]?.logicalLocations // Needs to be per-run
	const rules = log.runs?.[0]?.resources?.rules // Needs to be per-run
	visit(log, schema200_181010, {
		location: node => {
			node.logicalLocationIndex = logicalLocationKey.get(node.logicalLocationKey ?? node.fullyQualifiedLogicalName)
			const logicalLocation = logicalLocations?.[node.logicalLocationIndex]
			if (logicalLocation) {
				logicalLocation.fullyQualifiedName ??= node.fullyQualifiedLogicalName
			}
			delete node.logicalLocationKey
		},
		fileLocation: (node, pointer) => {
			node.index ??= fileKeyToIndex.get(node.properties?.key ?? node.uri)
			node.uri = files?.[node.index]?.fileLocation.uri ?? node.uri
		},
		result: node => {
			node.ruleIndex = ruleIdToIndex.get(node.ruleId)
			node.ruleId = rules?.[node.ruleIndex]?.id ?? node.ruleId
		},
	})
}

// Should use schema200_190109
function applyTc31(log: any) {
	visit(log, schema200_181010, (node: any, typeName: string) => {
		// https://github.com/oasis-tcs/sarif-spec/issues/311
		if (typeName === 'run' && node.resources) {
			const { tool, resources } = node
			revalues(resources.messageStrings, text => ({ text }))
			tool.globalMessageStrings = resources.messageStrings
			tool.ruleDescriptors = resources.rules
			delete node.resources
		}
		if (typeName === 'rule') {
			rename(node, 'configuration', 'defaultConfiguration')
		}
		if (typeName === 'ruleConfiguration') { // When is the type renamed to `reportingConfiguration`?
			rename(node, 'defaultLevel', 'level')
			rename(node, 'defaultRank', 'rank')
		}

		// https://github.com/oasis-tcs/sarif-spec/issues/179
		if (typeName === 'run' || typeName === 'conversion') {
			const driver = node.tool
			node.tool = {
				language: driver.language,
				driver,
			}
			delete driver.sarifLoggerVersion
			delete driver.language
		}
		if (typeName === 'run') {
			rename(node, 'richTextMimeType', 'markdownMessageMimeType')
		}
		if (typeName === 'rule') {
			// 190124 missing run:run . resources:resources . rules:rule[]
			// but 200 has it
			revalues(node.messageStrings, text => ({ text })) // TODO: Merge richMessageStringsrichMessageStrings
			for (const key in node.richMessageStrings) {
				node.messageStrings[key].markdown = node.richMessageStrings[key]
			}
			delete node.richMessageStrings
		}

		if (typeName === 'result') {
			// https://github.com/oasis-tcs/sarif-spec/issues/312
			if (node.baselineState === 'existing') node.baselineState = 'unchanged'

			// https://github.com/oasis-tcs/sarif-spec/issues/317
			switch (node.level) {
				case 'error':
				case 'warning':
				case 'note':
					node.kind = 'fail'
					break;
				case 'open':
				case 'notApplicable':
				case 'pass':
					node.kind = node.level
					node.level = 'none'
					break;
				default:
					break;
			}
		}

		if (typeName === 'threadFlowLocation') {
			rename(node, 'kind', 'kinds', x => [x])
		}

		if (typeName === 'file') {
			rename(node, 'fileLocation', 'location')
		}
		if (typeName === 'run') {
			rename(node, 'files', 'artifacts')
		}

		if (typeName === 'message') {
			rename(node, 'richText', 'markdown')
		}
		if (typeName === 'file') {
			rename(node, 'fileChange', 'artifactChange')
		}
		if (typeName === 'physicalLocation') { // !!! What about?: definitions file fileChange
			rename(node, 'fileLocation', 'artifactLocation')
		}
		if (typeName === '') { // !!! no match
			rename(node, 'fileIndex', 'artifactIndex')
		}
		if (typeName === 'fix') {
			rename(node, 'fileChanges', 'changes')
		}
	})	
}

function applyTc32(log: any) {
	visit(log, schema200_190124, (node: any, typeName: string) => {
		// https://github.com/oasis-tcs/sarif-spec/issues/330
		if (typeName === 'reportingDescriptor') {
			node.name = node.name?.text // Structural
			delete node.shortDescription?.messageId
			delete node.shortDescription?.arguments
			delete node.fullDescription?.messageId
			delete node.fullDescription?.arguments
		}
		if (typeName === 'exception') { // Needs to be traversed before the renames below.
			node.message = node.message?.text // Structural
		}
		if (typeName === 'invocation') {
			rename(node, 'toolNotifications', 'toolExecutionNotifications') // Structural
			rename(node, 'configurationNotifications', 'toolConfigurationNotifications') // Structural
		}
		// https://github.com/oasis-tcs/sarif-spec/issues/325
		if (typeName === 'externalPropertyFile') {
			rename(node, 'instanceGuid', 'guid')
			rename(node, 'artifactLocation', 'location')
		}
		// https://github.com/oasis-tcs/sarif-spec/issues/336
		if (typeName === 'toolComponent') {
			rename(node, 'artifactIndex', 'artifactIndices', x => [x])  // Non-structural because value is instrinsic.
		}
	})
}

function applyTc33(log: any) {
	visit(log, schema200_190220, (node: any, typeName: string) => {
		// https://github.com/oasis-tcs/sarif-spec/issues/337
		if (typeName === 'externalPropertyFiles') {
			rename(node, 'tool', 'driver')
		}
		// https://github.com/oasis-tcs/sarif-spec/issues/338
		if (typeName === 'run') {
			rename(node, 'externalPropertyFiles', 'externalPropertyFileReferences')
		}
		// https://github.com/oasis-tcs/sarif-spec/issues/324
		if (typeName === 'notification') {
			rename(node, 'id', 'descriptor', id => ({ id }))
			if (node.ruleId || node.ruleIndex !== undefined) {
				node.associatedRule = {
					id: node.ruleId,
					index: node.ruleIndex,
				}
				delete node.ruleId
				delete node.ruleIndex
			}
		}
		// https://github.com/oasis-tcs/sarif-spec/issues/344
		if (typeName === 'result') {
			rename(node, 'suppressionStates', 'suppressions', x => x.map(kind => ({ kind })))
		}
		// https://github.com/oasis-tcs/sarif-spec/issues/341
		if (typeName === 'run') {
			rename(node, 'baselineInstanceGuid', 'baselineGuid')

			// Regroup as runAutomationDetails? When was run.id added?
			rename(node.id, 'instanceGuid', 'guid')
			rename(node.id, 'instanceId', 'id')

			rename(node, 'id', 'automationDetails')

			node.aggregateIds?.forEach(node => {
				rename(node, 'instanceGuid', 'guid')
				rename(node, 'instanceId', 'id')
			})
			rename(node, 'aggregateIds', 'runAggregates')
		}
		if (typeName === 'result') {
			rename(node, 'instanceGuid', 'guid')
		}
		if (typeName === 'resultProvenance') {
			rename(node, 'firstDetectionRunInstanceGuid', 'firstDetectionRunGuid')
			rename(node, 'lastDetectionRunInstanceGuid', 'lastDetectionRunGuid')
		}

		// https://github.com/oasis-tcs/sarif-spec/issues/340
		if (typeName === 'location') {
			const { fullyQualifiedLogicalName, logicalLocationIndex } = node
			if (fullyQualifiedLogicalName || logicalLocationIndex !== undefined) {
				// Any undefined values will stringify away.
				node.logicalLocation = {
					fullyQualifiedName: fullyQualifiedLogicalName,
					index: logicalLocationIndex
				}
				delete node.fullyQualifiedLogicalName
				delete node.logicalLocationIndex
			}
		}

		// https://github.com/oasis-tcs/sarif-spec/issues/338
		if (typeName === 'run') {
			node.language = node.tool.language
			delete node.tool.language
		}
		if (typeName === 'toolComponent') {
			rename(node, 'ruleDescriptors', 'rules')
			rename(node, 'notificationDescriptors', 'notifications')
		}

		// https://github.com/oasis-tcs/sarif-spec/issues/302
		if (typeName === 'stackFrame') {
			const { address, offset } = node
			if (address !== undefined || offset !== undefined) {
				node.location = {
					physicalLocation: {
						address: {
							baseAddress: address,
							offset
						}
					}
				}
			}
		}

		// https://github.com/oasis-tcs/sarif-spec/issues/352
		if (typeName === 'message') {
			rename(node, 'messageId', 'id')
		}
	})
}

function applyTc34(log: any) {
	const applyStateMessages = node => {
		revalues(node.initialState, text => ({ text }))
		revalues(node.immutableState, text => ({ text }))
	}
	visit(log, schema200_190220, {
		edgeTraversal: node => {
			revalues(node.finalState, text => ({ text }))
		},
		graphTraversal: applyStateMessages,
		threadFlow: applyStateMessages,
		threadFlowLocation: node => {
			revalues(node.state, text => ({ text }))
		}
	})
}

// Should be schema210_beta1 or backtrack from rtm0
// Need to post process or block visit of artifactLocations
function applyTc35(log: any) {
	visit(log, schema210rtm0, (node: any, typeName: string) => {
		// https://github.com/oasis-tcs/sarif-spec/issues/366
		if (typeName === 'toolComponent') {
			rename(node, 'artifactIndices', 'locations', x => x.map(index => ({ index })))
		}
		if (typeName === 'run') {
			rename(node, 'defaultFileEncoding', 'defaultEncoding')
			rename(node, 'redactionToken', 'redactionTokens', x => [x])
		}
		// https://github.com/oasis-tcs/sarif-spec/issues/375
		if (typeName === 'location') {
			if (node.physicalLocation?.id) {
				node.id = node.physicalLocation?.id
				delete node.physicalLocation.id
			}
		}
		// https://github.com/oasis-tcs/sarif-spec/issues/371
		if (typeName === 'suppression') {
			if (node.kind === 'suppressedInSource') node.kind = 'inSource'
			if (node.kind === 'suppressedExternally') node.kind = 'external'
		}

		if (typeName === 'notification') {
			rename(node, 'physicalLocation', 'locations', x => [{ physicalLocation: x }])
		}

		if (typeName === 'fix') {
			rename(node, 'changes', 'artifactChanges')
		}

		if (typeName === 'artifact' && node.roles) {
			node.roles = node.roles.map(role => {
				switch (role) {
					case 'unmodifiedFile':
					case 'modifiedFile':
					case 'addedFile':
					case 'deletedFile':
					case 'renamedFile':
					case 'uncontrolledFile':
						return role.replace('File', '')
					case 'traceFile':
						return 'tracedFile'
					default:
						return role
				}
			})
			node.roles.sort() // For easier comparison in testing.
		}
	})
}

function applyRtm0(log: any) {
	// https://github.com/oasis-tcs/sarif-spec/issues/399
	// Using schema200 as a good-enough substitute for beta2
	visit(log, schema210rtm0, (node: any, typeName: string) => {
		if (typeName === 'invocation') {
			if (node.toolExecutionSuccessful !== undefined) {
				node.executionSuccessful = node.toolExecutionSuccessful
				delete node.toolExecutionSuccessful
			} else {
				node.executionSuccessful = node.exitCode === undefined || node.exitCode === 0
			}
		}
	})
}

function applyRtm1(log: any) {
	// https://github.com/oasis-tcs/sarif-spec/issues/414
	visit(log, schema210rtm0, {
		location: node => {
			rename(node, 'logicalLocation', 'logicalLocations', x => [x])
		}
	})
}

function applyRtm5(log: any) {
	revalue(log, 'version', '2.1.0')
	revalue(log, '$schema', 'https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0-rtm.5.json')
	log.inlineExternalProperties?.forEach(iep => {
		revalue(iep, 'version', '2.1.0')
		revalue(iep, 'schema', 'https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0-rtm.5.json')
	})
	visit(log, schema210rtm5, (node: any, typeName: string) => {
		if (typeName === 'suppression') {
			rename(node, 'state', 'status')
		}
	})
}

// Javascript helpers:

function rename(o: Record<string, any> | undefined, oldPropName, newPropName, transform = x => x) {
	if (!o) return
	if (o[oldPropName] === undefined) return // Still need to delete oldPropName?
	// if (o[oldPropName]) { // Don't map undefined values like undefined => [undefined]
		o[newPropName] = transform(o[oldPropName])
	// }
	delete o[oldPropName]
}

function revalue<T>(object: any, key: string, value: T) {
	if (object[key] && object[key] !== value) {
		object[key] = value
	}
}

function revalues(o: Record<string, any> | undefined, f: (x: any) => any) {
	if (!o) return
	for (const key of Object.keys(o)) {
		o[key] = f(o[key])
	}
}

