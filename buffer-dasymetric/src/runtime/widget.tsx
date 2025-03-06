import { React, type AllWidgetProps } from 'jimu-core'; 
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import Point from '@arcgis/core/geometry/Point';
import * as projection from '@arcgis/core/geometry/projection';
import { TextInput, Button, Alert } from 'jimu-ui';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import Graphic from '@arcgis/core/Graphic';
import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol';

// ✅ Define Choropleth Color Function
const getChoroplethColor = (adjPop: number) => {
  if (adjPop === 0) return [255, 255, 255, 0.8]; // White
  if (adjPop <= 100) return [255, 235, 175, 0.8]; // Light Orange
  if (adjPop <= 1000) return [255, 170, 0, 0.8]; // Orange
  if (adjPop <= 2500) return [230, 76, 0, 0.8]; // Dark Orange
  if (adjPop <= 5000) return [168, 0, 0, 0.8]; // Red
  return [115, 0, 76, 0.8]; // Dark Purple
};

const Widget = (props: AllWidgetProps<any>) => {
  const [state, setState] = React.useState({
    jimuMapView: null as JimuMapView | null,
    latitude: '',
    longitude: '',
    siteName: '',
    errorMessage: null as string | null,
    isLoading: false,
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

    let censusLayer = state.jimuMapView.view.map.findLayerById("census-layer") as GraphicsLayer;
    if (!censusLayer) {
      censusLayer = new GraphicsLayer({ id: "census-layer" });
      state.jimuMapView.view.map.add(censusLayer);
    }
    censusLayer.removeAll();

    let summaryStats: { [key: string]: number } = {};

    let allBufferGeometries: __esri.Geometry[] = [];

    for (let index = 0; index < BUFFER_DISTANCES_METERS.length; index++) {
      const outerBuffer = geometryEngine.buffer(projectedPoint, BUFFER_DISTANCES_METERS[index], "meters");
      const innerBuffer = index > 0 ? geometryEngine.buffer(projectedPoint, BUFFER_DISTANCES_METERS[index - 1], "meters") : null;
      const ringBuffer = innerBuffer ? geometryEngine.difference(outerBuffer, innerBuffer) : outerBuffer;
      if (!ringBuffer) continue;

      allBufferGeometries.push(ringBuffer);

      // ✅ Add Buffer Ring (Always Purple)
      const bufferGraphic = new Graphic({
        geometry: ringBuffer,
        symbol: new SimpleFillSymbol({
          color: [130, 0, 160, 0.3], // Purple Fill (Transparent)
          outline: { color: [130, 0, 160], width: 2 } // Bold Purple Outline
        }),
      });
      bufferLayer.add(bufferGraphic);

      // ✅ Query Census Data for the Ring
      const query = censusLayer.createQuery();
      query.geometry = ringBuffer;
      query.spatialRelationship = "intersects";
      query.outFields = ["TOTALPOP", "ACRES"];

      const results = await censusLayer.queryFeatures(query);
      results.features.forEach(feature => {
        const clippedFeature = geometryEngine.intersect(feature.geometry, ringBuffer);
        if (!clippedFeature) return;

        let originalAcres = feature.attributes?.ACRES;
        let clippedAcres = geometryEngine.geodesicArea(clippedFeature, "acres");
        if (!originalAcres || originalAcres <= 0 || isNaN(originalAcres)) return;

        const ratio = clippedAcres > 0 ? clippedAcres / originalAcres : 0;
        const adjPop = Math.round(ratio * (feature.attributes?.TOTALPOP || 0));

        const ringLabel = `${BUFFER_DISTANCES_MILES[index - 1] || 0}-${BUFFER_DISTANCES_MILES[index]} miles`;
        summaryStats[ringLabel] = (summaryStats[ringLabel] || 0) + adjPop;

        // ✅ Create Census Block Choropleth Graphic
        const censusGraphic = new Graphic({
          geometry: clippedFeature,
          symbol: new SimpleFillSymbol({
            color: getChoroplethColor(adjPop),
            outline: { color: [0, 0, 0], width: 1 } // Black outline for visibility
          }),
          attributes: { ADJ_POP: adjPop },
        });

        censusLayer.add(censusGraphic);
      });
    }

    setState({ ...state, isLoading: false, summaryStats });
  };

  return (
    <div className="widget-container">
      <h1>Dasymetric Population Tool</h1>
      <JimuMapViewComponent useMapWidgetId="widget_6" onActiveViewChange={activeViewChangeHandler} />

      <div className="statistics-box">
        <h3>Statistics</h3>
        {Object.entries(state.summaryStats).map(([buffer, adjPop]) => (
          <p key={buffer}><b>{buffer}:</b> {adjPop}</p>
        ))}
      </div>
    </div>
  );
};

export default Widget;
