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

  // ✅ Create the FeatureLayer (not GraphicsLayer) for better TOC/Legend support
  let bufferLayer = state.jimuMapView.view.map.findLayerById("buffer-layer") as FeatureLayer;
  if (!bufferLayer) {
    bufferLayer = new FeatureLayer({
      id: "buffer-layer",
      title: "Dasymetric Population Density",
      source: [],
      fields: [
        { name: "POP_DEN", alias: "Population Density", type: "double" },
        { name: "ACRES2", alias: "Clipped Acres", type: "double" }
      ],
      objectIdField: "OBJECTID",
      geometryType: "polygon",
      spatialReference: { wkid: 4326 },
      minScale: 0,  // Fully visible
      maxScale: 0,   // Fully visible
      renderer: densityRenderer
    });

    state.jimuMapView.view.map.add(bufferLayer);
    console.log("🟦 Buffer Layer Type:", bufferLayer.type);
  } else {
    await bufferLayer.applyEdits({ deleteFeatures: bufferLayer.source.toArray() });
  }

  // ✅ Find the first basemap layer
  const basemapLayer = state.jimuMapView.view.basemap.baseLayers.find(layer =>
    layer.type.includes("tile") || layer.type.includes("vector")
  );

  if (basemapLayer) {
    // ✅ Move bufferLayer right above the basemap
    state.jimuMapView.view.map.reorder(bufferLayer, state.jimuMapView.view.map.layers.indexOf(basemapLayer) + 1);
    console.log("🟨 Buffer Layer Index in TOC:", state.jimuMapView.view.map.layers.indexOf(bufferLayer));

  } else {
    console.warn("⚠️ No basemap layer found! Buffer layer will remain in default order.");
  }

  const censusLayerTitle = `CensusBlocks${state.selectedCensusYear}`;
  const censusLayer = state.jimuMapView.view.map.allLayers.find(
    (layer) => layer.title === censusLayerTitle
  ) as FeatureLayer;

  if (!censusLayer) {
    setState({
      ...state,
      errorMessage: "Census layer not found. Ensure 'CensusBlocks2010' is added to the map.",
      isLoading: false
    });
    return;
  }


  let summaryStats: { [key: string]: number } = {};
  let allBufferGeometries: __esri.Geometry[] = [];
  let featuresToAdd: __esri.Graphic[] = [];

  for (let index = 0; index < BUFFER_DISTANCES_METERS.length; index++) {
    const outerBuffer = geometryEngine.buffer(projectedPoint, BUFFER_DISTANCES_METERS[index], "meters");
    const innerBuffer = index > 0 ? geometryEngine.buffer(projectedPoint, BUFFER_DISTANCES_METERS[index - 1], "meters") : null;
    const ringBuffer = innerBuffer ? geometryEngine.difference(outerBuffer, innerBuffer) : outerBuffer;
    if (!ringBuffer) continue;

    allBufferGeometries.push(ringBuffer);

    const query = censusLayer.createQuery();
    query.geometry = ringBuffer;
    query.spatialRelationship = "intersects";
    query.outFields = ["TOTALPOP", "ACRES", "POP_DEN"];

    const results = await censusLayer.queryFeatures(query);

    results.features.forEach(feature => {
      const clippedFeature = geometryEngine.intersect(feature.geometry, ringBuffer);
      if (!clippedFeature) return;

      let originalAcres = feature.attributes?.ACRES;
      let clippedAcres = geometryEngine.geodesicArea(clippedFeature, "acres");
      if (!originalAcres || originalAcres <= 0 || isNaN(originalAcres)) return;

      const ratio = clippedAcres > 0 ? clippedAcres / originalAcres : 0;
      const adjPop = Math.round(ratio * (feature.attributes?.TOTALPOP || 0));
      const origPOP = feature.attributes?.TOTALPOP;
      const popDensity = feature.attributes?.POP_DEN || 0;

      const ringLabel = `${BUFFER_DISTANCES_MILES[index - 1] || 0}-${BUFFER_DISTANCES_MILES[index]} miles`;
      summaryStats[ringLabel] = (summaryStats[ringLabel] || 0) + adjPop;

      // ✅ Collect Features for .applyEdits() instead of .add()
      const censusGraphic = new Graphic({
        geometry: clippedFeature,
        attributes: {
          ACRES2: clippedAcres,
          POP_DEN: popDensity
        },
        popupTemplate: {
          title: `Census Block Data`,
          content:
            `<b>Population:</b> ${origPOP}<br>
            <b>Population:</b> ${adjPop}<br>
            <b>ACRES:</b> ${originalAcres.toFixed(2)}<br>
            <b>ACRES2:</b> ${clippedAcres.toFixed(2)}<br>
            <b>POP_DEN:</b> ${popDensity}<br>`
        }
      });

      featuresToAdd.push(censusGraphic);
    });
  }

  // ✅ Add Features with .applyEdits() for FeatureLayer
  await bufferLayer.applyEdits({ addFeatures: featuresToAdd });

  // ✅ Ensure map zooms to the full extent of buffers
  if (allBufferGeometries.length > 0) {
    const bufferExtent = geometryEngine.union(allBufferGeometries)?.extent;
    if (bufferExtent) {
      state.jimuMapView.view.goTo(bufferExtent, { duration: 1500 }).catch(err =>
        console.error("Zoom error:", err)
      );
    }
  }
console.log("🟩 Density Renderer Applied:", bufferLayer.renderer);
  setState({ ...state, isLoading: false, summaryStats });
};


  return (
    <div className="widget-container">
      <h1>Dasymetric Population Tool</h1>
      <JimuMapViewComponent useMapWidgetId="widget_6" onActiveViewChange={activeViewChangeHandler} />
  
      <div className="input-container">
        <TextInput placeholder="Site Name" onChange={(e) => setState({ ...state, siteName: e.target.value })} />
        <TextInput placeholder="Latitude" onChange={(e) => setState({ ...state, latitude: e.target.value })} />
        <TextInput placeholder="Longitude" onChange={(e) => setState({ ...state, longitude: e.target.value })} />
        <Select value={state.selectedCensusYear} onChange={(e) => setState({ ...state, selectedCensusYear: e.target.value })}>
          <Option value="1990">1990 Census</Option>
          <Option value="2000">2000 Census</Option>
          <Option value="2010">2010 Census</Option>
        </Select>
        <Button onClick={processPoint}>Process</Button>
      </div>
  
      {state.errorMessage && <Alert type="error" text={state.errorMessage} />}
  
      {/* ✅ Now attaching this div directly inside the map view */}
      {state.jimuMapView && state.jimuMapView.view.container && (
        <div
          style={{
            position: "absolute",
            top: "10px",
            right: "10px",
            background: "white",
            padding: "10px",
            border: "1px solid black",
            boxShadow: "2px 2px 10px rgba(0,0,0,0.2)",
            zIndex: 10, // Ensures it stays above the map
            opacity: 0.9, // Slight transparency to not obscure map too much
            maxWidth: "220px",
            pointerEvents: "none" // Prevents blocking map interactions
          }}
          ref={(el) => {
            if (el && state.jimuMapView) {
              state.jimuMapView.view.container.appendChild(el); // ✅ Attaching stats box to the map
            }
          }}
        >
          <h2>Statistics</h2>
          <h3><b>Site:</b>{state.siteName}</h3>
          <hr />
          {Object.entries(state.summaryStats).map(([buffer, adjPop]) => (
            <p key={buffer}><b>{buffer}:</b> {adjPop}</p>
          ))}
        </div>
      )}
    </div>
  );

};

export default Widget;
