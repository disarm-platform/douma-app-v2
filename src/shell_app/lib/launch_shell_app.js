import Vue from 'vue'
import Vuex from 'vuex'
import VueRouter from 'vue-router'
import VueLoading from 'vuex-loading'
import {get} from 'lodash'

import Shell from '../pages/Shell'
import Login from '../pages/Login'
import InstanceConfigs from '../pages/Instances'
import Geodata from '../pages/geodata'

import {hide_loading_page} from 'config/hide_loading_page'
import {remove_douma_app} from 'config/launch_main_app'
import {remove_app} from 'config/remove_app'
import {persist_shell_data} from 'shell_app/lib/shell_data'
import COMMON from 'config/common'

let shell_app
export let store

export const store_defaults = {
  api_url: COMMON.api.default_url,
  user: null,
  personalised_instance_id: 'default',
  instances: [],
  instance_config: null,
}

export function launch_shell_app({api_url, user, personalised_instance_id}) {

  Vue.material.registerTheme({
    shell: {
      primary: 'amber'
    },
  })

  Vue.material.setCurrentTheme('shell')

  const routes = [
    {
      path: '/',
      name: 'shell:root',
      redirect: '/instance_configs'
    },
    {
      path: '/login',
      name: 'shell:login',
      component: Login,
    },
    {
      path: '/instance_configs',
      name: 'shell:instance_configs',
      component: InstanceConfigs,
    },
    {
      path: '/geodata',
      name: 'shell:geodata',
      component: Geodata,
    },
    {
      path: '*',
      redirect: '/'
    }
  ]

  const router = new VueRouter({
    routes,
    mode: 'history'
  })


  
  router.beforeEach((to, from, next) => {
    if (to.name === 'shell:login') return next()
    if (!get(store.state, 'user', false)) return next({name: 'shell:login'})
    if (to.name === 'shell:geodata' && !store.state.instance_config) {
      return next({name: 'shell:root'})}

    return next()
  })



  store = new Vuex.Store({
    state: {
      api_url: api_url || store_defaults.api_url,
      user: user || store_defaults.user,
      personalised_instance_id: personalised_instance_id || store_defaults.personalised_instance_id,
      instances: store_defaults.instances,
      instance_config: store_defaults.instance_config,
    },
    mutations: {
      set_api_url: (state, api_url) => {
        state.api_url = api_url
        persist_shell_data('api_url', state.api_url)
      },
      reset_api_url: (state) => {
        state.api_url = store_defaults.api_url
        persist_shell_data('api_url', state.api_url)
      },
      set_user: (state, user) => {
        state.user = user
        persist_shell_data('user', state.user)
      },
      set_personalised_instance_id: (state, personalised_instance_id) => {
        state.personalised_instance_id = personalised_instance_id
        persist_shell_data('personalised_instance_id', state.personalised_instance_id)
      },
      set_instances: (state, instances) => {
        state.instances = instances
      },
      set_instance_config: (state, instance_config) => {
        state.instance_config = instance_config
        persist_shell_data('instance_config', state.instance_config)
      },
      reset_store: (state) => {
        state.user = store_defaults.user
        persist_shell_data('user', state.user)

        state.personalised_instance_id = store_defaults.personalised_instance_id
        persist_shell_data('personalised_instance_id', state.personalised_instance_id)

        state.instances = store_defaults.instances
        // these are not persisted normally

        state.instance_config = store_defaults.instance_config
        persist_shell_data('instance_config', state.instance_config)
      }
    },
  })


// TODO: Check if necessary to manually recreate the div like this
  const el_id = 'shell'
  if (!document.getElementById(el_id)) {
    const new_el = document.createElement('div')
    new_el.id = el_id
    document.getElementsByTagName('body')[0].appendChild(new_el)
  }

  shell_app = new Vue({
    replace: false,
    el: `#${el_id}`,
    router,
    store,
    vueLoading: new VueLoading(),
    render: createElement => createElement(Shell),
  })

  window.__shell_app_debug = shell_app

  // Cleanup
  hide_loading_page()
  remove_douma_app()

  return shell_app
}

export function remove_shell_app() {
  remove_app(shell_app)
}
