<template>
  <md-card class="card">
    <md-card-content>

      <div id="map"></div>
      <map_legend
          :entries="entries_for_legend"
          :title="selected_layer"
        ></map_legend>

      <div>
        <span>Show areas by:</span>

        <layer_selector
            :aggregation_names="options.aggregation_names"
            :selected_layer="selected_layer"
            @change="set_selected_layer"
        >
        </layer_selector>

      </div>

      <md-checkbox :disabled="!responses.length" v-model="show_response_points">Show response points <b v-if="!responses.length">(No responses loaded)</b></md-checkbox>

    </md-card-content>
  </md-card>
</template>

<script>
  import {mapGetters, mapState} from 'vuex'
  import {clone, get} from 'lodash'
  import flatten_object from 'flat'
  import moment from 'moment-mini'
  import Raven from 'raven-js'
  // Map and geospatial
  import {featureCollection, point} from '@turf/helpers'
  import bbox from '@turf/bbox'
  import centroid from '@turf/centroid'
  import {Popup} from 'mapbox-gl'

  import {basic_map} from 'lib/helpers/basic_map.js'
  import map_legend from 'components/map_legend.vue'
  import layer_selector from './layer-selector.vue'
  import cache from 'config/cache'
  import {layer_definitions} from 'config/map_layers'
  import {prepare_palette} from 'lib/helpers/palette_helper'

  import get_data from '../../lib/get_data_for_viz'
  import {decorate_with_risk, entries_for_legend} from 'apps/irs_monitor/lib/map-helpers'

  let risk_scaler

  export default {
    props: {
      'responses': Array,
      'targets': Array,
      'aggregations': Array,
      'options': {},
      'plan_target_area_ids': Array
    },
    components: {map_legend, layer_selector},
    data() {
      return {
        // map object
        _map: null, // Keep here for now, might make production debugging slightly more possible
        map_loaded: false,
        bbox: [],
        _click_handler: null,
        _responses_click_handler: null,
        _aggregated_responses_fc: null,
        _filtered_responses_fc: null,
      }
    },
    watch: {
      'responses': 'redraw_layers',
      'map_loaded': 'redraw_layers',
      'show_response_points': 'redraw_layers',
      'selected_layer': 'switch_layer',
    },
    computed: {
      ...mapState({
        instance_config: state => state.instance_config,
      }),
      entries_for_legend() {
        return entries_for_legend(this.selected_layer, risk_scaler)
      },
      selected_layer: {
        get() {return this.$store.state.irs_monitor.map_options.selected_layer},
        set(val) {this.$store.commit('irs_monitor/set_selected_layer', val) }
      },
      show_response_points: {
        get() {return this.$store.state.irs_monitor.map_options.show_response_points},
        set(val) {this.$store.commit('irs_monitor/set_show_response_points', val)}
      }

    },
    mounted() {
      this.render_map()
    },
    methods: {
      // Higher-level map stuff
      render_map() {
        this._map = basic_map(this.$store)

        this._map.on('load', () => {
          this.map_loaded = true
        })
      },
      fit_bounds() {
        if (!this.bbox.length) return 
        this._map.fitBounds(this.bbox, {padding: 20})
      },
      redraw_layers() {
        if (!this.map_loaded) return

        // TODO: Why timeout?
        setTimeout(() => {
          this.calculate_layer_attributes()
          this.switch_layer()
          this.fit_bounds()
        }, 0)
      },
      set_selected_layer(layer_string) {
        this.selected_layer = layer_string
      },
      switch_layer() {
        const layer_string = this.selected_layer

        this.$ga.event('irs_monitor',`view_${layer_string}`)

        this.add_layer(layer_string)
        this.add_response_points()
        this.zoom_to_features()
      },
      zoom_to_features () {
        // Zoom to features
        if (!this._aggregated_responses_fc.features.length) return 
        this.bbox = bbox(this._aggregated_responses_fc)
        this.bind_popup(this.selected_layer)
      },

      // Lower-level map stuff
      clear_map() {
        const ids = ['areas', 'area_labels']
        ids.forEach((id) => {
          if (this._map.getLayer(id)) {
            this._map.removeLayer(id)
          }

          if (this._map.getSource(id)) {
            this._map.removeSource(id)
          }
        })
      },
      add_layer(layer_string) {
        this.clear_map()

        if (layer_string === 'none') return // TODO: @refac from 'none'

        const layer_type = get(layer_definitions, layer_string, layer_definitions['default_palette'])

        // create stops
        const palette = prepare_palette(layer_type)

        // Create layer and add to map
        this._map.addLayer({
          id: 'areas',
          type: 'fill',
          source: {
            type: 'geojson',
            data: this._aggregated_responses_fc
          },
          paint: {
            'fill-color': {
              property: layer_string,
              stops: palette
            },
            'fill-opacity': 0.9,
            'fill-outline-color': 'black'
          }
        }, this._map.getLayer('area_labels') ? 'area_labels' : null)

        const centroid_features = this._aggregated_responses_fc.features.map((feature) => {
          const c = centroid(feature)
          c.properties = feature.properties
          return c
        })

        this._map.addLayer({
          id: 'area_labels',
          type: 'symbol',
          source: {
            type: 'geojson',
            data: featureCollection(centroid_features)
          },
          layout: {
            'text-field': `{__disarm_geo_name}`,
          }
        })

      },
      bind_popup() {
        // Get and prepare data

        const aggregation_names = this.options.aggregation_names
        const property_layers = this.options.property_layers

        if (!property_layers.concat(aggregation_names).length) return

        // Display the prepared data

        // Remove previous click handler before anything
        this._map.off('click', 'areas', this._click_handler)

        // Define new click handler
        this._click_handler = (e) => {
          e.originalEvent.stopPropagation()
          const feature = this._map.queryRenderedFeatures(e.point, {layers: ['areas']})[0]

          if (feature) {
            // get properties from options
            const aggregation_paragraphs = aggregation_names.map(property => {
              return `<p>${property} : ${feature.properties[property]}</p>`
            }).join('')

            const property_paragraphs = property_layers.map(({property, label}) => {
              return `<p>${label} : ${feature.properties[property]}</p>`
            }).join('')


            new Popup({closeOnClick: true})
              .setLngLat(e.lngLat)
              .setHTML(`
                <p><b>${feature.properties.__disarm_geo_name}</b></p>
                ${aggregation_paragraphs}
                ${property_paragraphs}
              `)
              .addTo(this._map);
          }
        }

        // Add click handler to map
        this._map.on('click', 'areas', this._click_handler)
      },

      // Data layers
      add_response_points() {
        if (this._map.getLayer('responses')) {
          this._map.removeLayer('responses')
        }

        if (this._map.getSource('responses')) {
          this._map.removeSource('responses')
        }

        if (!this.show_response_points) return

        const points = this.responses.map(response => {
          const {latitude, longitude} = get(response, 'location.coords', null)

          if (!latitude || !longitude) {
            const e = new Error('Missing lat or lng from coordinates')
            Raven.captureException(e)
            return null
          }

          const coords_point = point([longitude, latitude])
          coords_point.properties = {...response._decorated, ...flatten_object(response)}

          return coords_point
        }).filter(a => a)

        const points_fc = featureCollection(points)

        this._map.addLayer({
          id: 'responses',
          type: 'circle',
          source: {
            type: 'geojson',
            data: points_fc
          },
          paint: {
            "circle-color": {
              "property": "status",
              "type": "identity",
              "default": 'grey'
            },
            'circle-radius': {
              base: 1.75,
              stops: [[12,3],[22,20]]
            },
            'circle-opacity': 0.9,
          }
        })

        this._map.off('click', 'responses', this._responses_click_handler)

        this._responses_click_handler = (e) => {
          e.originalEvent.stopPropagation()

          const feature = this._map.queryRenderedFeatures(e.point, {layers: ['responses']})[0]
          
          if (!feature) return 

          const popup_properties_html = Object.keys(feature.properties)
            .filter(property_name => {
              return this.instance_config.applets.irs_monitor.map.response_point_fields.includes(property_name)
            })
            .map(key => {
              let title = clone(key)
              let value = clone(feature.properties[key])

              if (key === 'recorded_on') {
                value = moment(feature.properties[key]).format('hh:mm DD MMM \'YY')
              } else {
                title = title.replace(/(form_data|_decorated)\./, '').replace(/_/,' ')
              }

              return `<div>${title} : ${value}</div>`
            })

          const popup_title_html = `<p><b>Response ${feature.properties.id}</b></p>`
          const popup_content_html = popup_title_html + popup_properties_html.join('')

          new Popup({closeOnClick: true})
            .setLngLat(e.lngLat)
            .setHTML(popup_content_html)
            .addTo(this._map);
        }

        // Add click handler to map
        this._map.on('click', 'responses', this._responses_click_handler)

      },

      calculate_layer_attributes() {
        // Get the aggregate data
        this._aggregated_responses_fc = get_data({
          responses: this.responses,
          targets: this.targets,
          aggregations: this.aggregations,
          options: this.options,
          geodata: cache.geodata // TODO: @refac When we fix geodata into store, etc
        })

        // Decorate with scaled risk values
        const features = this._aggregated_responses_fc.features
        this._aggregated_responses_fc.features = decorate_with_risk(features, risk_scaler)
      },
    }
  }
</script>
<style scoped>
  .card {
    overflow: visible;
    z-index: 1;
  }

  #map {
    height: 500px
  }
</style>
