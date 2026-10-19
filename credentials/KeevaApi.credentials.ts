import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class KeevaApi implements ICredentialType {
	name = 'keevaApi';

	displayName = 'Keeva API';

	icon: Icon = {
		light: 'file:../nodes/Keeva/keeva.svg',
		dark: 'file:../nodes/Keeva/keeva.dark.svg',
	};

	documentationUrl = 'https://github.com/Atelix/n8n-nodes-keeva?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			placeholder: 'kva_…',
			description:
				'A club API key (starts with kva_). A club manager creates it in the Keeva club app under Manage → API keys; it is shown only once.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			required: true,
			default: 'https://keeva.app',
			description:
				'The address of Keeva. Your club address, like https://yourclub.keeva.app, also works. Never use api.keeva.app.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL:
				'={{String($credentials.baseUrl).trim().replace(/\\/+$/, "").replace(/\\/api\\/v1$/, "")}}/api/v1',
			url: '/key',
			method: 'GET',
		},
	};
}
