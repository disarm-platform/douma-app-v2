import {shell_axios} from 'shell_app/lib/shell_request_handler'


async function login({ username, password, personalised_instance_id}) {
  const request = {
    method: 'post',
    url: `/auth/login`,
    data: {
      username, 
      password
    },
    params: {
      personalised_instance_id
    }
  }
  return shell_axios(request)
}

async function get_permissions({user_id}) {
  const request = {
    method: 'get',
    url: `/users/${user_id}/permissions`
  }
  return shell_axios(request)
}

export default {
  login,
  get_permissions
}