import { React, type AllWidgetProps } from 'jimu-core'; 
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import Point from '@arcgis/core/geometry/Point';
import * as projection from '@arcgis/core/geometry/projection';
import { TextInput, Button, Alert, Select, Option } from 'jimu-ui';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol';

// ✅ **Standardized Buffer Distances**
const BUFFER_DISTANCES_MILES = [0.25, 0.5, 1, 2, 3, 4];  
const BUFFER_DISTANCES_METERS = BUFFER_DISTANCES_MILES.map(miles => miles * 1609.34);

// Colors for each buffer
const BUFFER_COLORS = [
  [255, 0, 0, 0.4],  // Red
  [255, 165, 0, 0.4], // Orange
  [255, 255, 0, 0.4], // Yellow
  [0, 128, 0, 0.4],   // Green
  [0, 0, 255, 0.4],   // Blue
  [128, 0, 128, 0.4]  // Purple
];

const Widget = (props: AllWidgetProps<any>) => {
  const [state, setState] = React.useState({
    jimuMapView: null as JimuMapView | null,
    latitude: '',
    longitude: '',
    siteName: '',
    errorMessage: null as string | null,
    isLoading: false,
    selectedCensusYear: '2010', // ✅ Default to 2010
    summaryStats: {} as { [key: string]: number }
  });

  const activeViewChangeHandler = (jmv: JimuMapView) => {
    if (!jmv) {
      setState({ ...state, errorMessage: 'No map view available. Check Map widget linkage.' });
      return;
    }
    setState({ ...state, jimuMapView: jmv });
  };

  const processPoint = async () => {
    const { latitude, longitude, siteName } = state;

    if (!latitude.trim() || !longitude.trim() || !siteName.trim()) {
      setState({ ...state, errorMessage: "Enter Latitude, Longitude, and Site Name." });
      return;
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setState({ ...state, errorMessage: "Invalid coordinates." });
      return;
    }

    const point = new Point({
      latitude: lat,
      longitude: lon,
      spatialReference: { wkid: 4326 }, // WGS84
    });

    await processBuffer(point);
  };

  // ✅ Define Choropleth Color Function (Now using POP_DEN)
const getChoroplethColor = (popDensity: number) => {
  if (popDensity === 0) return [255, 255, 255, 0.8]; // White
  if (popDensity <= 100) return [255, 235, 175, 0.8]; // Light Orange
  if (popDensity <= 1000) return [255, 170, 0, 0.8]; // Orange
  if (popDensity <= 2500) return [230, 76, 0, 0.8]; // Dark Orange
  if (popDensity <= 5000) return [168, 0, 0, 0.8]; // Red
  return [115, 0, 76, 0.8]; // Dark Purple
};

const processBuffer = async (point: Point) => {
  if (!state.jimuMapView) {
    setState({ ...state, errorMessage: "Map view not loaded." });
    return;
  }

  setState({ ...state, isLoading: true, errorMessage: null });
  await projection.load();

  const mapSR = state.jimuMapView.view.spatialReference;
  const projectedPoint = projection.project(point, mapSR) as Point;
  if (!projectedPoint) {
    setState({ ...state, errorMessage: "Projection failed.", isLoading: false });
    return;
  }

  let bufferLayer = state.jimuMapView.view.map.findLayerById("buffer-layer") as GraphicsLayer;
  if (!bufferLayer) {
    bufferLayer = new GraphicsLayer({ id: "buffer-layer" });
    state.jimuMapView.view.map.add(bufferLayer);
  }
  bufferLayer.removeAll();

  const censusLayerTitle = `CensusBlocks${state.selectedCensusYear}`;
  const censusLayer = state.jimuMapView.view.map.allLayers.find(
    (layer) => layer.title === censusLayerTitle
  ) as FeatureLayer;

  if (!censusLayer) {
    setState({ ...state, errorMessage: `Census layer (${censusLayerTitle}) not found.`, isLoading: false });
    return;
  }

  let summaryStats: { [key: string]: number } = {};
  let allBufferGeometries: __esri.Geometry[] = [];

  for (let index = 0; index < BUFFER_DISTANCES_METERS.length; index++) {
    const outerBuffer = geometryEngine.buffer(projectedPoint, BUFFER_DISTANCES_METERS[index], "meters");
    const innerBuffer = index > 0 ? geometryEngine.buffer(projectedPoint, BUFFER_DISTANCES_METERS[index - 1], "meters") : null;
    const ringBuffer = innerBuffer ? geometryEngine.difference(outerBuffer, innerBuffer) : outerBuffer;
    if (!ringBuffer) continue;

    allBufferGeometries.push(ringBuffer);

    const query = censusLayer.createQuery();
    query.geometry = ringBuffer;
    query.spatialRelationship = "intersects";
    // 🛠️ Dynamically set the population field based on the selected year
    let popField = "TOTALPOP"; // Default for 1990 & 2010
    if (state.selectedCensusYear === "2000") {
      popField = "POP100";  // 🔧 Corrected field name for Census 2000
    }
    
    // ✅ Now query the correct field dynamically
    query.outFields = [popField, "ACRES", "POP_DEN"];

    const results = await censusLayer.queryFeatures(query);
    results.features.forEach(feature => {
      const clippedFeature = geometryEngine.intersect(feature.geometry, ringBuffer);
      if (!clippedFeature) return;

      let originalAcres = feature.attributes?.ACRES;
      let clippedAcres = geometryEngine.geodesicArea(clippedFeature, "acres");
      if (!originalAcres || originalAcres <= 0 || isNaN(originalAcres)) return;

      const ratio = clippedAcres / originalAcres;
      const adjPop = Math.round(ratio * (feature.attributes?.TOTALPOP || 0));
      const popDensity = feature.attributes?.POP_DEN || 0;
      const ringLabel = `${BUFFER_DISTANCES_MILES[index - 1] || 0}-${BUFFER_DISTANCES_MILES[index]} miles`;
      summaryStats[ringLabel] = (summaryStats[ringLabel] || 0) + adjPop;

      const censusGraphic = new Graphic({
        geometry: clippedFeature,
        symbol: new SimpleFillSymbol({
          color: getChoroplethColor(popDensity),
          outline: { color: [0, 0, 0], width: 1 }
        }),
        attributes: { ACRES2: clippedAcres, POP_DEN: popDensity }
      });

      bufferLayer.add(censusGraphic);
    });
  }

  setState({ ...state, isLoading: false, summaryStats });
};

return (
  <div className="widget-container">
    <JimuMapViewComponent useMapWidgetId="widget_6" onActiveViewChange={activeViewChangeHandler} />
    <h1>Dasymetric Population Tool</h1>
    <TextInput placeholder="Latitude" onChange={(e) => setState({ ...state, latitude: e.target.value })} />
    <TextInput placeholder="Longitude" onChange={(e) => setState({ ...state, longitude: e.target.value })} />
    <Button onClick={processPoint}>Process</Button>
  </div>
);

export default Widget;

