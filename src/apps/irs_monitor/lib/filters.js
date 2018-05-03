import {get} from 'lodash'

export function filter_responses(responses, filters = []) {
  if (filters.length === 0) return responses

  const filter_fn = compose_filter_function(filters)
  const filter_names = filters.map(f => f.name)

  // Loop over every response
  // `for` loop is faster by 10x than Array#filter
  let output = []
  for (let i = 0; i < responses.length; i++) {
    let response = responses[i]

    // Check response has all required fields for filters
    const all_field_present = filter_names.every(filter_name => {
      return get(response, filter_name, null) !== null
    })
    if (!all_field_present) return

    // Run composed filter against response, and keep response if true
    if (filter_fn(response)) output.push(response)
  }
  return output
}


function compose_filter_function(filters) {
  const fns = filters.map(filter_function)

  return (response) => {
    return fns.every(fn => {
      return fn.call(this, response)
    })
  }
}

function filter_function({name, comparator, value}) {
  const accepted_comparators = ['equals', '>=', '<=', '>', '<', 'not_equals']
  if (accepted_comparators.indexOf(comparator) < 0) throw new Error(`Unsupported comparator ${comparator}`)

  switch (name) {
    case 'recorded_on':
      return day_comparison_function({name, comparator, value})
    default:
      return standard_comparison_function({name, comparator, value})
  }
}


function standard_comparison_function({name, comparator, value}) {
  switch (comparator) {
    case "equals":
      return (response) => response[name] === value
    case ">=":
      return (response) => response[name] >= value
    case "<=":
      return (response) => response[name] <= value
    case "<":
      return (response) => response[name] < value
    case ">":
      return (response) => response[name] > value
    case "not_equals":
      return (response) => response[name] !== value
  }
}

function day_comparison_function({name, comparator, value}) {
  switch (comparator) {
    case "equals":
      return (response) => convert_datetime_to_days(response[name]) === convert_datetime_to_days(value)
    case ">=":
      return (response) => convert_datetime_to_days(response[name]) >= convert_datetime_to_days(value)
    case "<=":
      return (response) => convert_datetime_to_days(response[name]) <= convert_datetime_to_days(value)
    case "<":
      return (response) => convert_datetime_to_days(response[name]) < convert_datetime_to_days(value)
    case ">":
      return (response) => convert_datetime_to_days(response[name]) > convert_datetime_to_days(value)
    case "not_equals":
      return (response) => convert_datetime_to_days(response[name]) !== convert_datetime_to_days(value)
  }
}

function convert_datetime_to_days(datetime) {
  const millis_in_a_day = 86400000
  // TODO: @refac Find another way to convert string to int in getTime
  return Math.floor(new Date(datetime).getTime() / millis_in_a_day) // filter_value_in_days
}