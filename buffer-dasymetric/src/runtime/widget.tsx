import { React, type AllWidgetProps } from 'jimu-core'; 
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis';
import * as geometryEngine from '@arcgis/core/geometry/geometryEngine';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import Point from '@arcgis/core/geometry/Point';
import projection from '@arcgis/core/geometry/projection';
import { TextInput, Button, Alert } from 'jimu-ui';
import * as Papa from 'papaparse';
import { saveAs } from 'file-saver';

// Configuration interface for buffer distances
interface IConfig {
  bufferDistances: number[];
}

// State interface for the widget
interface IState {
  jimuMapView: JimuMapView | null;
  latitude: string;
  longitude: string;
  siteName: string;
  errorMessage: string | null;
  isLoading: boolean;
  bufferResults: any[];
}

// Conversion constant: 1 mile = 1609.34 meters
const MILES_TO_METERS = 1609.34;

const Widget = (props: AllWidgetProps<IConfig>) => {
  // Initialize state
  const [state, setState] = React.useState<IState>({
    jimuMapView: null,
    latitude: '',
    longitude: '',
    siteName: '',
    errorMessage: null,
    isLoading: false,
    bufferResults: [],
  });

  // Handler for when the map view is initialized or changed
  const activeViewChangeHandler = (jmv: JimuMapView) => {
    console.log('Map view received:', jmv ? 'Valid' : 'Null');
    if (!jmv) {
      console.error('No map view available. Check Map widget ID (widget_6).');
      setState({ ...state, errorMessage: 'No map view available. Check Map widget linkage.' });
      return;
    }
    setState({ ...state, jimuMapView: jmv });
    jmv.view.when(() => {
      console.log('Map view loaded, spatial reference:', jmv.view.spatialReference.wkid);
    }).catch((err) => {
      console.error('Map view failed to load:', err);
      setState({ ...state, errorMessage: 'Failed to load map view: ' + err.message });
    });
  };

  // Process the input point and perform buffering
  const processPoint = async (point: Point) => {
    if (!state.jimuMapView) {
      setState({ ...state, errorMessage: 'Map view not loaded. Add a Map widget.' });
      return;
    }
    if (!state.siteName.trim()) {
      setState({ ...state, errorMessage: 'Please enter a site name.' });
      return;
    }

    setState({ ...state, isLoading: true, errorMessage: null });
    const bufferDistances = props.config?.bufferDistances || [0.25, 0.5, 1, 2, 3, 4];
    const censusLayer = state.jimuMapView.view.map.allLayers.find(
      (layer) => layer.title === 'CensusBlocks2010'
    ) as FeatureLayer;

    if (!censusLayer) {
      setState({
        ...state,
        errorMessage: 'Census layer (CensusBlocks2010) not found in the map.',
        isLoading: false,
      });
      return;
    }

    let buffers: __esri.Geometry[];
    try {
      // Load the projection engine
      await projection.load();
      console.log('Projection engine loaded successfully');

      // Project the point to the map's spatial reference
      const mapSR = state.jimuMapView.view.spatialReference;
      let projectedPoint: Point;
      try {
        projectedPoint = projection.project(point, mapSR) as Point;
        console.log('Point projected to map spatial reference:', projectedPoint);
      } catch (projError) {
        console.error('Projection failed:', projError);
        setState({
          ...state,
          errorMessage: 'Failed to project point to map spatial reference.',
          isLoading: false,
        });
        return;
      }

      // Validate the projected point
      if (!projectedPoint || !projectedPoint.spatialReference) {
        throw new Error('Projected point is invalid or missing spatial reference.');
      }

      // Create buffers in meters and ensure they are consistently formatted
      buffers = bufferDistances.map((distance) => {
        const buffer = geometryEngine.buffer(projectedPoint, distance * MILES_TO_METERS, 'meters');

        if (!buffer) {
          console.error('Failed to create buffer for distance:', distance);
          return null;
        }

        // Ensure the result is always an array of geometries
        return Array.isArray(buffer) ? buffer : [buffer];
      }).flat() // Flatten the array to ensure it's always Geometry[]
        .filter((buffer): buffer is __esri.Geometry => !!buffer); // Remove any null values

      if (buffers.length === 0) {
        throw new Error('No valid buffers were created.');
      }
      console.log('Buffers created:', buffers);
    } catch (error) {
      console.error('Error in projection or buffering:', error);
      setState({
        ...state,
        errorMessage: `Error processing data: ${error.message}`,
        isLoading: false,
      });
      return;
    }

    // Query the census layer with the largest buffer
    const query = censusLayer.createQuery();
    query.geometry = buffers[buffers.length - 1];
    query.outFields = ['TOTALPOP', 'ACRES'];

    try {
      const result = await censusLayer.queryFeatures(query);
      if (!result.features.length) {
        setState({
          ...state,
          errorMessage: 'No census features found within the largest buffer.',
          isLoading: false,
        });
        return;
      }

      // Calculate buffer results using intersection
      const bufferResults = bufferDistances.map((distance, index) => {
        const clippedFeatures = result.features.filter((feature) => {
          if (!feature.geometry || !feature.geometry.spatialReference) {
            console.warn('Skipping feature with invalid geometry:', feature);
            return false;
          }
          if (!buffers[index] || !buffers[index].spatialReference) {
            console.warn('Skipping invalid buffer at index:', index);
            return false;
          }
          return geometryEngine.intersects(buffers[index], feature.geometry);
        });

        const totalPop = clippedFeatures.reduce(
          (sum, feature) => sum + (feature.attributes?.TOTALPOP || 0),
          0
        );
        const totalAcres = clippedFeatures.reduce(
          (sum, feature) => sum + (feature.attributes?.ACRES || 0),
          0
        );
        const popDensity = totalPop > 0 && totalAcres > 0 ? totalPop / totalAcres : 0;

        return {
          Distance: distance,
          Features: clippedFeatures.length,
          Population: totalPop,
          Clip_Pop: totalPop,
          Clip_Area: totalAcres,
          POP_DEN: popDensity,
        };
      });

      setState({ ...state, isLoading: false, errorMessage: null, bufferResults });
      console.log('Buffer analysis completed:', bufferResults);
    } catch (error) {
      console.error('Buffer processing error:', error);
      setState({
        ...state,
        errorMessage: `Error processing data: ${error.message}`,
        isLoading: false,
      });
    }
  };

  return <div>Widget UI goes here...</div>;
};

export default Widget;

