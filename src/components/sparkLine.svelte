<svelte:options tag="chart-sparkline" />

<style>
  .sparkLine {
    overflow: hidden;
  }
</style>

<script>
  import { onMount } from 'svelte';

  export let width       = 130;
  export let height      = 30;
  export let line_color  = '#b5ddfa';
  export let fill_color  = '#ecf7fe';
  export let values      = '100, 300, 150, 350, 450, 600, 700';
  export let strokeWidth = 1;

  function normalize(pulse, height){
    var maxVal = Math.max(...pulse);
    var minVal = Math.min(...pulse);
    return pulse.map(value => {
      var result = (value - minVal) / (maxVal - minVal) * height;
      return height - result
    })
  };

  function calcCoordinates(pulse, height, width){
    let values    = pulse.split(',').map(num => parseInt(num));
    let tickWidth = width / values.length;
    let yAxisVal  = normalize(values, height);
    let xAxisVal  = values.map((_v, idx) => idx * tickWidth);
    let dataSet   = values.map((_v, idx) => [xAxisVal[idx], yAxisVal[idx]]);

    let first = [-2, height];
    let last  = [dataSet[dataSet.length - 1][0] + 2, height];
    dataSet.unshift(first);
    dataSet.push(last);

    let coordinates = '';
    for(let i = 0; i < dataSet.length; i++){
      coordinates = coordinates + `${dataSet[i][0]},${dataSet[i][1]}\n`;
    }
    return coordinates
  };

  $: coordinates = calcCoordinates(values, height, width);
</script>

<svg class="sparkLine" height="{height}" width="{width}">
  <polyline
    stroke="{line_color}"
    fill="{fill_color}"
    stroke-width="{strokeWidth}"
    stroke-linejoin="round"
    shape-rendering="geometricPrecision"
    points="
      {coordinates}
    "
  ></polyline>
</svg>