import { React, type AllWidgetProps } from 'jimu-core';
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import Point from '@arcgis/core/geometry/Point';
import { TextInput, Button, Alert } from 'jimu-ui';
import * as Papa from 'papaparse';
import { saveAs } from 'file-saver';

interface IConfig {
  bufferDistances: number[];
}

interface IState {
  jimuMapView: JimuMapView | null;
  latitude: string;
  longitude: string;
  siteName: string;
  errorMessage: string | null;
  isLoading: boolean;
  bufferResults: any[];
}

// Convert miles to meters (1 mile = 1609.34 meters)
const MILES_TO_METERS = 1609.34;

const Widget = (props: AllWidgetProps<IConfig>) => {
  const [state, setState] = React.useState<IState>({
    jimuMapView: null,
    latitude: '',
    longitude: '',
    siteName: '',
    errorMessage: null,
    isLoading: false,
    bufferResults: [],
  });

  const activeViewChangeHandler = (jmv: JimuMapView) => {
    console.log('Map view received:', jmv ? 'Valid' : 'Null');
    if (!jmv) {
      console.error('No map view available. Check hardcoded Map widget ID (widget_6).');
      setState({ ...state, errorMessage: 'No map view available. Check Map widget linkage.' });
      return;
    }
    setState({ ...state, jimuMapView: jmv });
    jmv.view.when(() => {
      console.log('Map view fully loaded');
    }).catch((err) => {
      console.error('Map view failed to load:', err);
      setState({ ...state, errorMessage: 'Failed to load map view: ' + err.message });
    });
  };

  const processPoint = async (point: Point) => {
    if (!state.jimuMapView) {
      setState({ ...state, errorMessage: 'Map view not loaded. Add a Map widget.' });
      return;
    }
    if (!state.siteName.trim()) {
      setState({ ...state, errorMessage: 'Please enter a site name before processing.' });
      return;
    }

    setState({ ...state, isLoading: true, errorMessage: null });
    const bufferDistances = props.config?.bufferDistances || [0.25, 0.5, 1, 2, 3, 4];
    const censusLayer = state.jimuMapView.view.map.allLayers.find((layer) => layer.title === 'CensusBlocks2010') as FeatureLayer;

    if (!censusLayer) {
      setState({ ...state, errorMessage: 'Census layer (CensusBlocks2010) not found in the map. Check layer title or URL.', isLoading: false });
      return;
    }

    // Project the point to Web Mercator (wkid: 3857) for linear units
    const webMercatorPoint = point.clone().project({ wkid: 3857 });

    const buffers = bufferDistances.map((distance) =>
      geometryEngine.buffer(webMercatorPoint, distance * MILES_TO_METERS, 'meters')
    );

    const query = censusLayer.createQuery();
    query.geometry = buffers[buffers.length - 1]; // Use largest buffer for simplicity
    query.outFields = ['TOTALPOP', 'ACRES']; // Request specific fields
    try {
      const result = await censusLayer.queryFeatures(query);
      if (!result.features.length) {
        setState({ ...state, errorMessage: 'No census features found within the largest buffer.', isLoading: false });
        return;
      }

      const bufferResults = bufferDistances.map((distance, index) => {
        const clippedFeatures = result.features.filter(feature =>
          geometryEngine.contains(buffers[index], feature.geometry)
        );

        const totalPop = clippedFeatures.reduce((sum, feature) => sum + (feature.attributes?.TOTALPOP || 0), 0);
        const totalAcres = clippedFeatures.reduce((sum, feature) => sum + (feature.attributes?.ACRES || 0), 0);
        const popDensity = totalPop > 0 && totalAcres > 0 ? totalPop / totalAcres : 0;

        return {
          Distance: distance,
          Features: clippedFeatures.length,
          Population: totalPop, // Raw population
          Clip_Pop: totalPop, // Adjusted population (same as raw for now, refine later)
          Clip_Area: totalAcres, // Adjusted area
          POP_DEN: popDensity, // Population density (people per acre)
        };
      });

      setState({ ...state, isLoading: false, errorMessage: null, bufferResults });
      console.log('Buffer analysis completed with:', bufferResults);

      // Export to CSV with PapaParse
      const csvData = Papa.unparse(bufferResults, { header: true });
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8' });
      saveAs(blob, `${state.siteName}_buffer_results.csv`);
    } catch (error) {
      console.error('Buffer processing error:', error);
      setState({ ...state, errorMessage: `Error processing data: ${error.message}`, isLoading: false });
    }
  };

  const handleCoordinateSubmit = async () => {
    const { latitude, longitude } = state;

    if (!latitude.trim() || !longitude.trim()) {
      setState({ ...state, errorMessage: 'Please enter both latitude and longitude.' });
      return;
    }

    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setState({ ...state, errorMessage: 'Invalid coordinates. Latitude: -90 to 90, Longitude: -180 to 180.' });
      return;
    }

    const point = new Point({
      latitude: lat,
      longitude: lon,
      spatialReference: { wkid: 4326 },
    });

    await processPoint(point);
  };

  return (
    <div className="widget-dasymetric jimu-widget" style={{ padding: '10px' }}>
      <h1>Buffer Dasymetric Widget</h1>
      <JimuMapViewComponent
        useMapWidgetId="widget_6"  // Hardcoded Map widget ID
        onActiveViewChange={activeViewChangeHandler}
      />

      <div style={{ marginTop: '10px' }}>
        <h4>Enter Coordinates and Site Name</h4>
        <TextInput
          placeholder="Latitude (e.g., 34.0522)"
          value={state.latitude}
          onChange={(e) => setState({ ...state, latitude: e.target.value })}
          style={{ marginRight: '10px', width: '150px' }}
        />
        <TextInput
          placeholder="Longitude (e.g., -118.2437)"
          value={state.longitude}
          onChange={(e) => setState({ ...state, longitude: e.target.value })}
          style={{ marginRight: '10px', width: '150px' }}
        />
        <TextInput
          placeholder="Site Name (e.g., Site A)"
          value={state.siteName}
          onChange={(e) => setState({ ...state, siteName: e.target.value })}
          style={{ marginRight: '10px', width: '150px' }}
        />
        <Button onClick={handleCoordinateSubmit} disabled={state.isLoading}>
          {state.isLoading ? 'Processing...' : 'Buffer Coordinates'}
        </Button>
      </div>

      {state.errorMessage && (
        <Alert
          type="error"
          text={state.errorMessage}
          withIcon={true}
          closable={true}
          onClose={() => setState({ ...state, errorMessage: null })}
          style={{ marginTop: '10px' }}
        />
      )}

      {state.isLoading && <div style={{ marginTop: '10px' }}>Analyzing data...</div>}

      {state.bufferResults.length > 0 && (
        <div style={{ marginTop: '10px' }}>
          <h4>Buffer Results</h4>
          <ul>
            {state.bufferResults.map((result, index) => (
              <li key={index}>
                {result.Distance} miles: {result.Features} features, Population: {result.Population}, 
                Adjusted Population: {result.Clip_Pop}, Adjusted Area: {result.Clip_Area} acres, 
                Density: {result.POP_DEN.toFixed(2)} people/acre
              </li>
            ))}
          </ul>
          <p>CSV exported as {state.siteName}_buffer_results.csv</p>
        </div>
      )}
    </div>
  );
};

export default Widget;
