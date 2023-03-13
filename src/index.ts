// Custom pathname for the upstream website. '/path'
const upstream_path = ''

// Countries and regions where you wish to suspend your service.
const blocked_region: Array<string> = []

// IP addresses which you wish to block from using your service.
const blocked_ip_address: Array<string> = ['0.0.0.0', '127.0.0.1']

// Whether to use HTTPS protocol for upstream address.
const https = true

// Replace texts.
const replace_dict: any = {
    '$upstream': '$custom_domain'
}

interface Env {
    RESOLVER_HOST: string
    API_KEY: string
}

export default {
    async fetch(request: Request, env: Env, context: ExecutionContext) {

        const region = request.headers.get('cf-ipcountry')!.toUpperCase();
        const ip_address = request.headers.get('cf-connecting-ip')!;
        const user_agent = request.headers.get('user-agent');

        let response = null;
        let url = new URL(request.url);
        let url_hostname = url.hostname;

        if (https == true) {
            url.protocol = 'https:';
        } else {
            url.protocol = 'http:';
        }

        if (await device_status(user_agent)) {
            // var upstream_domain = 'subdomain.domain.com';
            var upstream_domain = env.RESOLVER_HOST;
        } else {
            // var upstream_domain = 'm.subdomain.domain.com'; // mobile host if available
            var upstream_domain = env.RESOLVER_HOST;
        }

        url.host = upstream_domain;
        url.pathname = upstream_path + url.pathname;
        url.searchParams.append('apikey', env.API_KEY)

        if (blocked_region.includes(region)) {
            response = new Response('Access denied: WorkersProxy is not available in your region.', {
                status: 403
            });
        } else if (blocked_ip_address.includes(ip_address)) {
            response = new Response('Access denied: Your IP address is blocked by WorkersProxy.', {
                status: 403
            });
        } else if (request.method !== 'GET') {
            response = new Response(`Method ${request.method} not allowed.`, {
				status: 405,
				headers: {
					Allow: 'GET',
				},
			});
        } else if (!['/vrf', '/decrypt', '/vizcloud'].includes(url.pathname)) {
            response = new Response('Bruh, Not Found.', {
                status: 404,
            });
        } else {
            let method = request.method;
            let request_headers = request.headers;
            let new_request_headers = new Headers(request_headers);

            new_request_headers.set('Host', upstream_domain);
            new_request_headers.set('Referer', url.protocol + '//' + url_hostname);

            let original_response = await fetch(url.href, {
                method: method,
                headers: new_request_headers,
                // cache based on response code
                cf: { cacheTtlByStatus: { '200-299': 86400, '404': 5, '500-599': 0 } },
            })

            let original_response_clone = new Response(original_response.body, original_response);
            let original_text = null;
            let response_headers = original_response.headers;
            let new_response_headers = new Headers(response_headers);
            let status = original_response.status;

            new_response_headers.set('access-control-allow-origin', '*');
            new_response_headers.set('access-control-allow-credentials', 'true');
            new_response_headers.delete('content-security-policy');
            new_response_headers.delete('content-security-policy-report-only');
            new_response_headers.delete('clear-site-data');
            
            if(new_response_headers.get("x-pjax-url")) {
                new_response_headers.set("x-pjax-url", response_headers.get("x-pjax-url")!.replace("//" + upstream_domain, "//" + url_hostname));
            }
            
            const content_type = new_response_headers.get('content-type');
            if (content_type != null && content_type.includes('text/html') && content_type.includes('UTF-8')) {
                original_text = await replace_response_text(original_response_clone, upstream_domain, url_hostname);
            } else {
                original_text = original_response_clone.body
            }
            
            response = new Response(original_text, {
                status,
                headers: new_response_headers
            })
        }
        return response;
    

        async function replace_response_text(response: Response, upstream_domain: string, host_name: string) {
            let text = await response.text()

            var i, j;
            for (i in replace_dict) {
                j = replace_dict[i]
                if (i == '$upstream') {
                    i = upstream_domain
                } else if (i == '$custom_domain') {
                    i = host_name
                }

                if (j == '$upstream') {
                    j = upstream_domain
                } else if (j == '$custom_domain') {
                    j = host_name
                }

                let re = new RegExp(i, 'g')
                text = text.replace(re, j);
            }
            return text;
        }


        async function device_status(user_agent_info: string | null) {
            if (!user_agent_info) return false;
            var agents = ["Android", "iPhone", "SymbianOS", "Windows Phone", "iPad", "iPod"];
            var flag = true;
            for (var v = 0; v < agents.length; v++) {
                if (user_agent_info.indexOf(agents[v]) > 0) {
                    flag = false;
                    break;
                }
            }
            return flag;
        }
    },
};